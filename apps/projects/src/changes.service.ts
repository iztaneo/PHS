import { Decimal } from 'decimal.js';
import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import { teamSnapshot } from './baselines.service.js';
import { ProjectError, lockProject, type Actor, type ProjectDetail, type ProjectsService } from './projects.service.js';

interface BeforeAfter { before: string | null; proposed: string | null }
export interface StoredImpact {
  baselineVersion: number;
  endsOn?: BeforeAfter;
  budget?: BeforeAfter & { delta: string };
  effortHours?: BeforeAfter & { delta: string };
  scope?: BeforeAfter;
  milestones: { id: string; title: string; before: string; proposed: string }[];
  correctsId: string | null;
}

export interface Change {
  id: string;
  title: string;
  description: string;
  changeType: string;
  proposedBy: { id: string; displayName: string };
  proposedAt: string;
  impact: StoredImpact;
  financialsHidden: boolean;
  decision: null | {
    decision: 'approved' | 'rejected'; decidedBy: { id: string; displayName: string }; decidedAt: string; comment: string;
    baselineVersion: number | null;
  };
  canDecide: boolean;
}

export interface CreateChange {
  title: string;
  description: string;
  changeType: string;
  impact: { endsOn?: string; budgetDelta?: string; effortHoursDelta?: string; scope?: string; milestones: { id: string; dueOn: string }[] };
  correctsId: string | null;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;
interface SnapshotMilestone { id: string; title: string; due_on: string; [key: string]: unknown }
interface CurrentBaseline {
  id: string; version: number; starts_on: string; ends_on: string; scope: string; budget: string | null; effort_hours: string | null;
  currency: string; milestone_snapshot: SnapshotMilestone[];
}

interface Row {
  id: string; title: string; description: string; change_type: string; proposed_by: string; proposed_by_name: string;
  proposed_at: Date; requested_impact: StoredImpact; decision: 'approved' | 'rejected' | null; decided_by: string | null;
  decided_by_name: string | null; decided_at: Date | null; comment: string | null; baseline_version: number | null;
}

const SELECT = `
  SELECT c.id, c.title, c.description, c.change_type, c.proposed_by, pu.display_name AS proposed_by_name, c.proposed_at,
         c.requested_impact, d.decision, d.decided_by, du.display_name AS decided_by_name, d.decided_at, d.comment,
         b.version AS baseline_version
    FROM phs.project_change c
    JOIN phs.app_user pu ON pu.id = c.proposed_by
    LEFT JOIN phs.change_decision d ON d.change_id = c.id
    LEFT JOIN phs.app_user du ON du.id = d.decided_by
    LEFT JOIN phs.baseline b ON b.approved_decision_id = d.id
   WHERE c.project_id = $1`;

function toChange(row: Row, project: ProjectDetail): Change {
  const show = project.capabilities.seeFinancials;
  const { budget: _budget, effortHours: _effort, ...withoutAmounts } = row.requested_impact;
  return {
    id: row.id, title: row.title, description: row.description, changeType: row.change_type,
    proposedBy: { id: row.proposed_by, displayName: row.proposed_by_name }, proposedAt: row.proposed_at.toISOString(),
    // Amounts are visible only to those who govern the project (D05).
    impact: show ? row.requested_impact : withoutAmounts,
    financialsHidden: !show && (row.requested_impact.budget !== undefined || row.requested_impact.effortHours !== undefined),
    decision: row.decision ? {
      decision: row.decision, decidedBy: { id: row.decided_by!, displayName: row.decided_by_name! },
      decidedAt: row.decided_at!.toISOString(), comment: row.comment!, baselineVersion: row.baseline_version,
    } : null,
    canDecide: project.capabilities.decide && row.decision === null,
  };
}

// null + delta is the delta: proposing a budget where none was known sets it.
function apply(before: string | null, delta: string): string {
  const result = new Decimal(before ?? 0).plus(delta);
  if (result.isNegative()) throw new ProjectError('invalid_impact');
  return result.toFixed(2);
}

export class ChangesService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsService) {}

  async list(userId: string, projectId: string): Promise<Change[]> {
    const project = await this.projects.get(userId, projectId);
    if (!project) throw new ProjectError('not_found');
    const found = await this.pool.query<Row>(`${SELECT} ORDER BY c.proposed_at DESC`, [projectId]);
    return found.rows.map((row) => toChange(row, project));
  }

  private async one(db: Queryable, project: ProjectDetail, changeId: string): Promise<Change> {
    const found = await db.query<Row>(`${SELECT} AND c.id = $2`, [project.id, changeId]);
    if (!found.rows[0]) throw new ProjectError('not_found');
    return toChange(found.rows[0], project);
  }

  private async currentBaseline(client: pg.PoolClient, projectId: string): Promise<CurrentBaseline> {
    const found = await client.query<CurrentBaseline>(
      `SELECT b.id, b.version, b.starts_on::text AS starts_on, b.ends_on::text AS ends_on, b.scope, b.budget, b.effort_hours,
              b.currency, b.milestone_snapshot
         FROM phs.project p JOIN phs.baseline b ON b.id = p.current_baseline_id WHERE p.id = $1`, [projectId]);
    if (!found.rows[0]) throw new ProjectError('baseline_required');
    return found.rows[0];
  }

  // Checks the impact against the baseline and returns it with the values before and proposed.
  private async resolve(client: pg.PoolClient, projectId: string, baseline: CurrentBaseline, input: CreateChange): Promise<StoredImpact> {
    const { impact } = input;
    const stored: StoredImpact = { baselineVersion: baseline.version, milestones: [], correctsId: input.correctsId };
    if (impact.endsOn !== undefined) {
      if (impact.endsOn < baseline.starts_on) throw new ProjectError('invalid_impact');
      stored.endsOn = { before: baseline.ends_on, proposed: impact.endsOn };
    }
    if (impact.budgetDelta !== undefined) stored.budget = { before: baseline.budget, delta: impact.budgetDelta, proposed: apply(baseline.budget, impact.budgetDelta) };
    if (impact.effortHoursDelta !== undefined) stored.effortHours = { before: baseline.effort_hours, delta: impact.effortHoursDelta, proposed: apply(baseline.effort_hours, impact.effortHoursDelta) };
    if (impact.scope !== undefined) stored.scope = { before: baseline.scope, proposed: impact.scope };
    if (impact.milestones.length) {
      if (new Set(impact.milestones.map((m) => m.id)).size !== impact.milestones.length) throw new ProjectError('invalid_impact');
      // Only open milestones committed in the baseline can be moved.
      const open = await client.query<{ id: string }>(
        `SELECT id FROM phs.milestone WHERE project_id = $1 AND id = ANY($2::uuid[]) AND committed_due_on IS NOT NULL
            AND status NOT IN ('completed', 'cancelled')`, [projectId, impact.milestones.map((m) => m.id)]);
      const movable = new Set(open.rows.map((r) => r.id));
      for (const m of impact.milestones) {
        const committed = baseline.milestone_snapshot.find((s) => s.id === m.id);
        if (!committed || !movable.has(m.id)) throw new ProjectError('invalid_impact');
        stored.milestones.push({ id: m.id, title: committed.title, before: committed.due_on, proposed: m.dueOn });
      }
    }
    const empty = !stored.endsOn && !stored.budget && !stored.effortHours && !stored.scope && stored.milestones.length === 0;
    if (empty) throw new ProjectError('invalid_impact');
    return stored;
  }

  // A proposal is recorded as sent and never edited: a correction is a new proposal that refers to it.
  async propose(actor: Actor, projectId: string, input: CreateChange, idempotencyKey: string): Promise<Change> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'change.propose', payload: { projectId, ...input } },
          async () => {
            const project = await lockProject(client, this.projects, actor, projectId, 'view');
            if (!project.capabilities.proposeAndReview) throw new ProjectError('forbidden');
            const baseline = await this.currentBaseline(client, projectId);
            if (input.correctsId) {
              const previous = await client.query('SELECT 1 FROM phs.project_change WHERE project_id = $1 AND id = $2', [projectId, input.correctsId]);
              if (!previous.rowCount) throw new ProjectError('not_found');
            }
            const impact = await this.resolve(client, projectId, baseline, input);
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO phs.project_change(project_id, title, description, change_type, proposed_by, requested_impact)
               VALUES($1, $2, $3, $4, $5, $6) RETURNING id`,
              [projectId, input.title, input.description, input.changeType, actor.userId, JSON.stringify(impact)]);
            const id = inserted.rows[0]!.id;
            await insertAudit(client, {
              requestId: actor.requestId, actorId: actor.userId, action: 'change.proposed', entityType: 'project_change', entityId: id,
              projectId, after: { title: input.title, changeType: input.changeType, baselineVersion: baseline.version },
            });
            await insertOutbox(client, { projectId, eventType: 'change.proposed', deduplicationKey: `change.proposed:${id}`, payload: { projectId, changeId: id } });
            return { status: 201, body: await this.one(client, project, id) };
          },
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ProjectError('idempotency_key_reused');
      throw error;
    }
  }

  async decide(
    actor: Actor, projectId: string, changeId: string, input: { decision: 'approved' | 'rejected'; comment: string }, idempotencyKey: string,
  ): Promise<Change> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'change.decide', payload: { projectId, changeId, ...input } },
          async () => {
            // The project lock decides two approvers one after the other: the second finds the decision.
            const project = await lockProject(client, this.projects, actor, projectId, 'view');
            if (!project.capabilities.decide) throw new ProjectError('forbidden');
            const change = await this.one(client, project, changeId);
            if (change.decision) throw new ProjectError('already_decided');
            const decision = await client.query<{ id: string }>(
              `INSERT INTO phs.change_decision(project_id, change_id, decision, decided_by, comment) VALUES($1, $2, $3, $4, $5) RETURNING id`,
              [projectId, changeId, input.decision, actor.userId, input.comment]);
            const revision = project.revision + 1;
            let baselineVersion: number | null = null;
            if (input.decision === 'approved') baselineVersion = await this.applyApproved(client, actor, project, changeId, decision.rows[0]!.id, revision);
            else await client.query('UPDATE phs.project SET revision = $2 WHERE id = $1', [projectId, revision]);
            await insertAudit(client, {
              requestId: actor.requestId, actorId: actor.userId, action: `change.${input.decision}`, entityType: 'project_change',
              entityId: changeId, projectId, after: { decision: input.decision, baselineVersion },
            });
            await insertOutbox(client, {
              projectId, eventType: `change.${input.decision}`, deduplicationKey: `change.decided:${changeId}`,
              payload: { projectId, changeId, decision: input.decision, baselineVersion, projectRevision: revision },
            });
            return { status: 201, body: await this.one(client, { ...project, revision }, changeId) };
          },
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ProjectError('idempotency_key_reused');
      throw error;
    }
  }

  // Creates baseline N+1 from baseline N plus exactly the impacts of the proposal, and moves only the
  // commitments it lists. Runs inside the decision's transaction: any failure undoes the decision too.
  private async applyApproved(
    client: pg.PoolClient, actor: Actor, project: ProjectDetail, changeId: string, decisionId: string, revision: number,
  ): Promise<number> {
    const baseline = await this.currentBaseline(client, project.id);
    const stored = (await client.query<{ requested_impact: StoredImpact; title: string }>(
      'SELECT requested_impact, title FROM phs.project_change WHERE id = $1', [changeId])).rows[0]!;
    const impact = stored.requested_impact;
    // The proposal was written against another baseline: its deltas must be reviewed, not applied blindly.
    if (impact.baselineVersion !== baseline.version) throw new ProjectError('baseline_changed');
    const stillOpen = await client.query<{ id: string; status: string; progress_pct: string | null }>(
      `SELECT id, status, progress_pct FROM phs.milestone WHERE project_id = $1 AND id = ANY($2::uuid[])
          AND committed_due_on IS NOT NULL AND status NOT IN ('completed', 'cancelled')`, [project.id, impact.milestones.map((m) => m.id)]);
    if (stillOpen.rowCount !== impact.milestones.length) throw new ProjectError('invalid_impact');

    const moved = new Map(impact.milestones.map((m) => [m.id, m.proposed]));
    const snapshot = baseline.milestone_snapshot.map((m) => (moved.has(m.id) ? { ...m, due_on: moved.get(m.id) } : m));
    const endsOn = impact.endsOn?.proposed ?? baseline.ends_on;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO phs.baseline(project_id, version, previous_baseline_id, approved_decision_id, starts_on, ends_on, scope, budget,
                                effort_hours, currency, milestone_snapshot, team_snapshot, reason, created_by)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [project.id, baseline.version + 1, baseline.id, decisionId, baseline.starts_on, endsOn, impact.scope?.proposed ?? baseline.scope,
        impact.budget ? impact.budget.proposed : baseline.budget, impact.effortHours ? impact.effortHours.proposed : baseline.effort_hours,
        baseline.currency, JSON.stringify(snapshot), JSON.stringify(await teamSnapshot(client, project.id)),
        `Cambio aprobado: ${stored.title}`, actor.userId]);
    await client.query('UPDATE phs.project SET current_baseline_id = $2, ends_on = $3, revision = $4 WHERE id = $1',
      [project.id, inserted.rows[0]!.id, endsOn, revision]);
    for (const m of stillOpen.rows) {
      const dueOn = moved.get(m.id)!;
      // An operational reschedule that is now approved stops being a deviation.
      const status = m.status === 'rescheduled' ? (Number(m.progress_pct ?? 0) > 0 ? 'in_progress' : 'pending') : m.status;
      await client.query(
        'UPDATE phs.milestone SET due_on = $3, committed_due_on = $3, status = $4, revision = revision + 1 WHERE project_id = $1 AND id = $2',
        [project.id, m.id, dueOn, status]);
      await client.query(
        `INSERT INTO phs.activity(project_id, milestone_id, actor_id, source, note, before_data, after_data)
         VALUES($1, $2, $3, 'user', $4, $5, $6)`,
        [project.id, m.id, actor.userId, `Fecha comprometida cambiada por el cambio aprobado: ${stored.title}`,
          JSON.stringify({ committedDueOn: impact.milestones.find((x) => x.id === m.id)!.before, status: m.status }),
          JSON.stringify({ committedDueOn: dueOn, status })]);
    }
    return baseline.version + 1;
  }
}
