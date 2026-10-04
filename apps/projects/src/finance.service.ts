import { RULE_SET_VERSION, financialDeviation, progress, type MilestoneInput } from '@phs/health-engine';
import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import {
  ProjectError, bumpProjectRevision, lockProject, type Actor, type ProjectDetail, type ProjectsService,
} from './projects.service.js';

export interface Observation {
  id: string;
  effectiveOn: string;
  totalCost: string;
  totalEffortHours: string | null;
  source: string;
  recordedBy: { id: string; displayName: string };
  recordedAt: string;
  supersedesId: string | null;
  superseded: boolean;
}

export interface FinanceSummary {
  currency: string;
  asOf: string;
  budget: string | null;
  effortBudgetHours: string | null;
  current: Observation | null;
  actualProgress: string | null;
  expectedCost: string | null;
  deviation: string | null;
  gate: boolean;
  missing: ('budget' | 'cost' | 'progress')[];
  ruleSetVersion: string;
  observations: Observation[];
}

export interface CreateObservation {
  effectiveOn: string;
  totalCost: string;
  totalEffortHours: string | null;
  source: string;
  supersedesId: string | null;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

interface Row {
  id: string; effective_on: string; total_cost: string; total_effort_hours: string | null; source: string;
  recorded_by: string; recorded_by_name: string; recorded_at: Date; supersedes_id: string | null; superseded: boolean;
}

const SELECT = `
  SELECT o.id, o.effective_on::text AS effective_on, o.total_cost, o.total_effort_hours, o.source, o.recorded_by,
         u.display_name AS recorded_by_name, o.recorded_at, o.supersedes_id,
         EXISTS (SELECT 1 FROM phs.financial_observation c WHERE c.supersedes_id = o.id) AS superseded
    FROM phs.financial_observation o JOIN phs.app_user u ON u.id = o.recorded_by
   WHERE o.project_id = $1`;

const toObservation = (r: Row): Observation => ({
  id: r.id, effectiveOn: r.effective_on, totalCost: r.total_cost, totalEffortHours: r.total_effort_hours, source: r.source,
  recordedBy: { id: r.recorded_by, displayName: r.recorded_by_name }, recordedAt: r.recorded_at.toISOString(),
  supersedesId: r.supersedes_id, superseded: r.superseded,
});

export class FinanceService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsService) {}

  private async financials(userId: string, projectId: string): Promise<ProjectDetail> {
    const project = await this.projects.get(userId, projectId);
    if (!project) throw new ProjectError('not_found');
    if (!project.capabilities.seeFinancials) throw new ProjectError('forbidden');
    return project;
  }

  private async today(db: Queryable, projectId: string): Promise<string> {
    const found = await db.query<{ today: string }>(
      "SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM phs.project WHERE id = $1", [projectId]);
    return found.rows[0]!.today;
  }

  // Milestones committed in the current baseline, with their weight and their live status.
  private async committedMilestones(projectId: string): Promise<MilestoneInput[]> {
    const found = await this.pool.query<{ weight: string; committed_due_on: string; status: MilestoneInput['status']; progress_pct: string | null }>(
      `SELECT coalesce((s.item->>'weight')::numeric, 1) AS weight, m.committed_due_on::text AS committed_due_on, m.status, m.progress_pct
         FROM phs.project p
         JOIN phs.baseline b ON b.id = p.current_baseline_id
         CROSS JOIN LATERAL jsonb_array_elements(b.milestone_snapshot) AS s(item)
         JOIN phs.milestone m ON m.project_id = p.id AND m.id = (s.item->>'id')::uuid
        WHERE p.id = $1 AND m.committed_due_on IS NOT NULL`, [projectId]);
    return found.rows.map((r) => ({
      weight: Number(r.weight), committedDueOn: r.committed_due_on, status: r.status,
      progressPct: r.progress_pct === null ? null : Number(r.progress_pct),
    }));
  }

  async summary(userId: string, projectId: string, asOf?: string): Promise<FinanceSummary> {
    const project = await this.financials(userId, projectId);
    const today = await this.today(this.pool, projectId);
    const date = asOf ?? today;
    const baseline = await this.pool.query<{ budget: string | null; effort_hours: string | null }>(
      `SELECT b.budget, b.effort_hours FROM phs.project p JOIN phs.baseline b ON b.id = p.current_baseline_id WHERE p.id = $1`, [projectId]);
    const all = (await this.pool.query<Row>(`${SELECT} ORDER BY o.effective_on DESC, o.recorded_at DESC`, [projectId])).rows.map(toObservation);
    // The applicable figure is one observation, never a sum: the latest effective date not after the
    // requested date, ignoring observations that were corrected.
    const current = all.find((o) => !o.superseded && o.effectiveOn <= date) ?? null;
    const actual = progress(await this.committedMilestones(projectId), today).actual;
    const budget = baseline.rows[0]?.budget ?? null;
    const result = financialDeviation({ budget, cost: current?.totalCost ?? null, actualProgress: actual });
    return {
      currency: project.currency, asOf: date, budget, effortBudgetHours: baseline.rows[0]?.effort_hours ?? null, current,
      actualProgress: actual, expectedCost: result.expectedCost, deviation: result.deviation, gate: result.gate,
      missing: result.missing, ruleSetVersion: RULE_SET_VERSION, observations: all,
    };
  }

  async record(actor: Actor, projectId: string, input: CreateObservation, idempotencyKey: string): Promise<Observation> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'finance.record', payload: { projectId, ...input } },
          async () => {
            const project = await lockProject(client, this.projects, actor, projectId, 'editOperation');
            if (!project.capabilities.seeFinancials) throw new ProjectError('forbidden');
            if (input.effectiveOn > (await this.today(client, projectId))) throw new ProjectError('invalid_effective_date');
            if (input.supersedesId) {
              const target = await client.query<{ superseded: boolean }>(
                `SELECT EXISTS (SELECT 1 FROM phs.financial_observation c WHERE c.supersedes_id = o.id) AS superseded
                   FROM phs.financial_observation o WHERE o.project_id = $1 AND o.id = $2`, [projectId, input.supersedesId]);
              if (!target.rows[0]) throw new ProjectError('not_found');
              if (target.rows[0].superseded) throw new ProjectError('already_superseded');
            }
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO phs.financial_observation(project_id, effective_on, total_cost, total_effort_hours, source, recorded_by, supersedes_id)
               VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [projectId, input.effectiveOn, input.totalCost, input.totalEffortHours, input.source, actor.userId, input.supersedesId]);
            const id = inserted.rows[0]!.id;
            const revision = await bumpProjectRevision(client, projectId);
            await insertAudit(client, {
              requestId: actor.requestId, actorId: actor.userId, action: input.supersedesId ? 'finance.corrected' : 'finance.recorded',
              entityType: 'financial_observation', entityId: id, projectId, after: { ...input },
            });
            await insertOutbox(client, {
              projectId, eventType: 'finance.recorded', deduplicationKey: `finance.recorded:${id}`,
              payload: { projectId, observationId: id, projectRevision: revision },
            });
            const row = (await client.query<Row>(`${SELECT} AND o.id = $2`, [projectId, id])).rows[0]!;
            return { status: 201, body: toObservation(row) };
          },
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ProjectError('idempotency_key_reused');
      throw error;
    }
  }
}
