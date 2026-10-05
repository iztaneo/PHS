import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction, type ProjectCapabilities } from '@phs/service-kit';
import type pg from 'pg';
import type { AssessmentsService } from './assessments.service.js';
import { addDays, dueDate, firstDueOnOrAfter, skipHolidays, type Cadence } from './cadence.js';
import { NEEDS_RESPONSE, type Actor, type GovernanceService } from './governance.service.js';
import type { ProjectsClient } from './projects.client.js';

type Topic = 'schedule' | 'milestones' | 'risks' | 'client' | 'finance' | 'scope' | 'team';
type Confidence = 'high' | 'medium' | 'low';
interface FinanceUpdate { totalCost: string; totalEffortHours: string | null }
type Climate = 'good' | 'tense' | 'critical';
interface Person { id: string; displayName: string }

export interface PolicyInput {
  cadence: Cadence; nextDueOn: string; forecastCycles: number; evidenceRequired: boolean; leadValidationRequired: boolean; autoTasks: boolean;
}
export interface PolicyView extends PolicyInput { revision: number }
export interface Expectation {
  kind: 'milestone' | 'risk' | 'task' | 'renewal' | 'change' | 'alert'; id: string; title: string; dueOn: string | null;
  overdue: boolean; critical: boolean; blocking: boolean;
}
export interface DraftPayload {
  nothingChanged: boolean; topics: Topic[]; notes: Partial<Record<Topic, string>>; clientClimate: Climate | null; supportText: string; activeSeconds: number;
  declaredConfidence: Confidence | null; finance: FinanceUpdate | null;
}
export interface ReviewInput {
  nothingChanged: boolean; topics: Topic[]; notes: Partial<Record<Topic, string>>; clientClimate: Climate | null; supportText: string;
  activeSeconds: number; expectedProjectRevision: number; declaredConfidence: Confidence | null; finance: FinanceUpdate | null;
}
export interface ReviewView {
  id: string; revisionNo: number; author: Person; submittedAt: string; effectiveOn: string; late: boolean; nothingChanged: boolean;
  topics: Topic[]; notes: Partial<Record<Topic, string>>; clientClimate: Climate | null; supportText: string | null; durationSeconds: number | null;
  declaredConfidence: Confidence | null; finance: FinanceUpdate | null;
  expectations: Expectation[]; assessment: { score: string | null; band: 'healthy' | 'attention' | 'risk' | null } | null;
  validation: { decision: 'validated' | 'returned'; validator: Person; decidedAt: string; comment: string } | null;
}
type CycleStatus = 'open' | 'overdue' | 'submitted' | 'returned' | 'validated' | 'closed';
interface PolicySnapshot { cadence: Cadence; forecastCycles: number; evidenceRequired: boolean; leadValidationRequired: boolean }
export interface CycleView {
  id: string; projectId: string; projectName: string; startsOn: string; dueOn: string; status: CycleStatus; policy: PolicySnapshot;
  // false: the cycle is scheduled but its period has not begun, so it cannot be reviewed yet.
  started: boolean;
  expectations: Expectation[]; draft: { revision: number; payload: DraftPayload; updatedAt: string } | null; reviews: ReviewView[];
  lastClimate: Climate | null; projectRevision: number; canSubmit: boolean; canValidate: boolean;
}
export interface ScheduleView { projectId: string; policy: PolicyView | null; canConfigure: boolean; cycles: CycleView[] }

export type ReviewErrorCode =
  | 'not_found' | 'forbidden' | 'due_date_in_past' | 'project_not_active' | 'revision_conflict' | 'review_already_submitted'
  | 'support_required' | 'finance_rejected' | 'climate_required' | 'invalid_request' | 'nothing_changed_blocked'
  | 'cycle_not_started' | 'idempotency_key_reused' | 'already_decided' | 'stale_review' | 'validation_not_required';
export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode, readonly currentRevision?: number) {
    super(code);
  }
}

const SUBMITTABLE: CycleStatus[] = ['open', 'overdue', 'returned'];
const INACTIVE = ['paused', 'closed'];

interface CycleRow {
  id: string; project_id: string; project_name: string; starts_on: string; due_on: string; policy_snapshot: Partial<PolicySnapshot>;
  project_revision: string; project_status: string; today: string; last_climate: Climate | null;
}
const CYCLE_SELECT = `
  SELECT c.id, c.project_id, p.name AS project_name, c.starts_on::text AS starts_on, c.due_on::text AS due_on, c.policy_snapshot,
         p.revision AS project_revision, p.status AS project_status, (now() AT TIME ZONE p.timezone)::date::text AS today,
         (SELECT r.client_climate FROM phs.health_review r WHERE r.project_id = c.project_id ORDER BY r.submitted_at DESC LIMIT 1) AS last_climate
    FROM phs.review_cycle c JOIN phs.project p ON p.id = c.project_id`;

export class ReviewService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly projects: ProjectsClient,
    private readonly governance: GovernanceService,
    private readonly assessments: AssessmentsService,
  ) {}

  private async holidays(db: pg.Pool | pg.PoolClient): Promise<Set<string>> {
    return new Set((await db.query<{ day: string }>('SELECT day::text AS day FROM phs.holiday')).rows.map((r) => r.day));
  }

  private async capabilities(actor: Actor, projectId: string): Promise<ProjectCapabilities> {
    const access = await this.projects.access(actor.identity, projectId);
    if (!access) throw new ReviewError('not_found');
    return access.capabilities;
  }

  // What the PM should look at in this review: commitments falling due up to the cycle's date,
  // what is waiting for a decision, and critical alerts that still have no cause and plan.
  // The cycle's own delay is never part of the list, so it cannot block its own submission (D02).
  private async expectations(db: pg.Pool | pg.PoolClient, cycle: CycleRow, policy: PolicySnapshot): Promise<Expectation[]> {
    const horizon = dueDate(cycle.due_on, policy.cadence, policy.forecastCycles);
    const found = await db.query<Expectation & { due_on: string | null }>(
      `SELECT * FROM (
         SELECT 'milestone' AS kind, m.id, m.title, m.due_on::text AS due_on, m.due_on < $3::date AS overdue, m.critical, false AS blocking, 1 AS pos
           FROM phs.milestone m WHERE m.project_id = $1 AND m.status NOT IN ('completed','cancelled') AND m.due_on <= $2::date
         UNION ALL
         SELECT 'risk', r.id, r.title, r.mitigation_due_on::text, r.mitigation_due_on < $3::date, r.probability * r.impact >= 6, false, 2
           FROM phs.risk r WHERE r.project_id = $1 AND r.status IN ('open','mitigating') AND r.mitigation_due_on <= $2::date
         UNION ALL
         SELECT 'task', t.id, t.title, t.due_on::text, t.due_on < $3::date, t.priority = 'high', false, 3
           FROM phs.health_task t LEFT JOIN phs.health_event e ON e.id = t.event_id
          WHERE t.project_id = $1 AND t.status NOT IN ('completed','cancelled') AND t.due_on <= $2::date
            AND coalesce(e.rule_key, '') NOT IN ('review_overdue','review_returned')
         UNION ALL
         SELECT 'renewal', n.id, 'Renovación del ' || n.due_on::text, n.due_on::text, n.due_on < $3::date, n.due_on < $3::date, false, 4
           FROM phs.renewal n WHERE n.project_id = $1 AND n.status = 'pending' AND n.due_on <= $4::date
         UNION ALL
         SELECT 'change', c.id, c.title, NULL::text, false, false, false, 5
           FROM phs.project_change c WHERE c.project_id = $1 AND NOT EXISTS (SELECT 1 FROM phs.change_decision d WHERE d.change_id = c.id)
         UNION ALL
         SELECT 'alert', e.id, e.title, NULL::text, false, true, true, 0
           FROM phs.health_event e
          WHERE e.project_id = $1 AND e.resolved_at IS NULL AND e.severity = 'critical' AND e.rule_key = ANY($5::text[])
            AND NOT EXISTS (
              SELECT 1 FROM phs.event_response x LEFT JOIN phs.event_response_validation v ON v.response_id = x.id
               WHERE x.event_id = e.id AND x.revision_no = (SELECT max(revision_no) FROM phs.event_response WHERE event_id = e.id)
                 AND coalesce(v.decision, 'pending') <> 'returned')
       ) x ORDER BY pos, due_on NULLS LAST, title, id`,
      [cycle.project_id, cycle.due_on, cycle.today, horizon, [...NEEDS_RESPONSE]]);
    return found.rows.map((r) => ({
      kind: r.kind, id: r.id, title: r.title, dueOn: r.due_on, overdue: r.overdue, critical: r.critical, blocking: r.blocking,
    }));
  }

  private async views(db: pg.Pool | pg.PoolClient, actor: Actor, capabilities: ProjectCapabilities, rows: CycleRow[]): Promise<CycleView[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const reviews = await db.query<{
      id: string; cycle_id: string; revision_no: number; author_id: string; author_name: string; submitted_at: Date; effective_on: string;
      nothing_changed: boolean; topics: Topic[]; client_climate: Climate | null; support_text: string | null; duration_seconds: number | null;
      submitted_data: { notes?: Partial<Record<Topic, string>>; declaredConfidence?: Confidence | null; finance?: FinanceUpdate | null }; expectations_snapshot: Expectation[]; assessed: boolean; score: string | null;
      band: 'healthy' | 'attention' | 'risk' | null;
      decision: 'validated' | 'returned' | null; validator_id: string | null; validator_name: string | null; decided_at: Date | null; comment: string | null;
    }>(
      `SELECT r.id, r.cycle_id, r.revision_no, r.author_id, au.display_name AS author_name, r.submitted_at, r.effective_on::text AS effective_on,
              r.nothing_changed, r.topics, r.client_climate, r.support_text, r.duration_seconds, r.submitted_data, r.expectations_snapshot,
              a.id IS NOT NULL AS assessed, a.score, a.dimension_results->>'band' AS band,
              v.decision, v.validator_id, vu.display_name AS validator_name, v.decided_at, v.comment
         FROM phs.health_review r
         JOIN phs.app_user au ON au.id = r.author_id
         LEFT JOIN phs.health_assessment a ON a.review_id = r.id
         LEFT JOIN phs.review_validation v ON v.review_id = r.id
         LEFT JOIN phs.app_user vu ON vu.id = v.validator_id
        WHERE r.cycle_id = ANY($1::uuid[]) ORDER BY r.revision_no DESC`, [ids]);
    const drafts = await db.query<{ cycle_id: string; payload: DraftPayload; revision: string; updated_at: Date }>(
      'SELECT cycle_id, payload, revision, updated_at FROM phs.review_draft WHERE cycle_id = ANY($1::uuid[]) AND author_id = $2', [ids, actor.userId]);
    const result: CycleView[] = [];
    for (const row of rows) {
      const policy = snapshot(row.policy_snapshot);
      const own: ReviewView[] = reviews.rows.filter((r) => r.cycle_id === row.id).map((r) => ({
        id: r.id, revisionNo: r.revision_no, author: { id: r.author_id, displayName: r.author_name }, submittedAt: r.submitted_at.toISOString(),
        effectiveOn: r.effective_on, late: r.effective_on > row.due_on, nothingChanged: r.nothing_changed, topics: r.topics,
        notes: r.submitted_data.notes ?? {}, declaredConfidence: r.submitted_data.declaredConfidence ?? null, finance: r.submitted_data.finance ?? null, clientClimate: r.client_climate, supportText: r.support_text, durationSeconds: r.duration_seconds,
        expectations: r.expectations_snapshot, assessment: r.assessed ? { score: r.score, band: r.band } : null,
        validation: r.decision ? { decision: r.decision, validator: { id: r.validator_id!, displayName: r.validator_name! }, decidedAt: r.decided_at!.toISOString(), comment: r.comment! } : null,
      }));
      const latest = own[0];
      const status: CycleStatus = !latest ? (row.due_on < row.today ? 'overdue' : 'open')
        : latest.validation ? latest.validation.decision
          : policy.leadValidationRequired ? 'submitted' : 'closed';
      // A cycle is reviewed during its period, never before: a review of the future would publish an
      // official assessment of something that has not happened (E2E-H01).
      const started = row.starts_on <= row.today;
      const submittable = SUBMITTABLE.includes(status) && started;
      const draft = drafts.rows.find((d) => d.cycle_id === row.id);
      result.push({
        id: row.id, projectId: row.project_id, projectName: row.project_name, startsOn: row.starts_on, dueOn: row.due_on, status, policy, started,
        expectations: submittable ? await this.expectations(db, row, policy) : latest?.expectations ?? [],
        draft: draft ? { revision: Number(draft.revision), payload: draft.payload, updatedAt: draft.updated_at.toISOString() } : null,
        reviews: own, lastClimate: row.last_climate, projectRevision: Number(row.project_revision),
        canSubmit: submittable && capabilities.proposeAndReview && !INACTIVE.includes(row.project_status),
        canValidate: status === 'submitted' && capabilities.decide,
      });
    }
    return result;
  }

  private async cycleRow(db: pg.Pool | pg.PoolClient, cycleId: string): Promise<CycleRow> {
    const row = (await db.query<CycleRow>(`${CYCLE_SELECT} WHERE c.id = $1`, [cycleId])).rows[0];
    if (!row) throw new ReviewError('not_found');
    return row;
  }

  private async one(db: pg.Pool | pg.PoolClient, actor: Actor, capabilities: ProjectCapabilities, cycleId: string): Promise<CycleView> {
    return (await this.views(db, actor, capabilities, [await this.cycleRow(db, cycleId)]))[0]!;
  }

  async cycle(actor: Actor, cycleId: string): Promise<CycleView> {
    const row = await this.cycleRow(this.pool, cycleId);
    const capabilities = await this.capabilities(actor, row.project_id);
    await this.governance.sync(row.project_id);
    return this.one(this.pool, actor, capabilities, cycleId);
  }

  private async scheduleOf(db: pg.Pool | pg.PoolClient, actor: Actor, capabilities: ProjectCapabilities, projectId: string): Promise<ScheduleView> {
    const policy = (await db.query<{
      cadence: Cadence; anchor_on: string; forecast_cycles: number; evidence_required: boolean; lead_validation_required: boolean;
      auto_tasks: boolean; revision: string; next_due: string | null;
    }>(
      `SELECT rp.cadence, rp.anchor_on::text AS anchor_on, rp.forecast_cycles, rp.evidence_required, rp.lead_validation_required, rp.auto_tasks, rp.revision,
              (SELECT min(c.starts_on)::text FROM phs.review_cycle c
                WHERE c.project_id = rp.project_id AND NOT EXISTS (SELECT 1 FROM phs.health_review r WHERE r.cycle_id = c.id)) AS next_due
         FROM phs.review_policy rp WHERE rp.project_id = $1`, [projectId])).rows[0];
    const rows = await db.query<CycleRow>(`${CYCLE_SELECT} WHERE c.project_id = $1 ORDER BY c.starts_on DESC LIMIT 12`, [projectId]);
    return {
      projectId, canConfigure: capabilities.editOperation,
      policy: policy ? {
        // The date of the schedule, before holidays: saving the form again must not move the cut-off day.
        cadence: policy.cadence, nextDueOn: policy.next_due ? firstDueOnOrAfter(policy.anchor_on, policy.cadence, policy.next_due) : policy.anchor_on, forecastCycles: policy.forecast_cycles,
        evidenceRequired: policy.evidence_required, leadValidationRequired: policy.lead_validation_required, autoTasks: policy.auto_tasks,
        revision: Number(policy.revision),
      } : null,
      cycles: await this.views(db, actor, capabilities, rows.rows),
    };
  }

  // A project without a policy has no cycle: it is shown as not configured, never given one silently.
  async schedule(actor: Actor, projectId: string): Promise<ScheduleView> {
    const capabilities = await this.capabilities(actor, projectId);
    await this.governance.sync(projectId);
    return this.scheduleOf(this.pool, actor, capabilities, projectId);
  }

  // Saving the policy schedules the first cycle, or moves the one still waiting for its review.
  // Cycles that already have a review keep the policy they were scheduled with.
  async savePolicy(actor: Actor, projectId: string, input: PolicyInput & { expectedRevision: number }): Promise<ScheduleView> {
    const capabilities = await this.capabilities(actor, projectId);
    if (!capabilities.editOperation) throw new ReviewError('forbidden');
    await withTransaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`review:${projectId}`]);
      const project = (await client.query<{ status: string; today: string }>(
        'SELECT status, (now() AT TIME ZONE timezone)::date::text AS today FROM phs.project WHERE id = $1', [projectId])).rows[0]!;
      if (INACTIVE.includes(project.status)) throw new ReviewError('project_not_active');
      if (input.nextDueOn < project.today) throw new ReviewError('due_date_in_past');
      const before = (await client.query<{ revision: string; cadence: string; anchor_on: string }>(
        'SELECT revision, cadence, anchor_on::text AS anchor_on FROM phs.review_policy WHERE project_id = $1', [projectId])).rows[0];
      const current = before ? Number(before.revision) : 0;
      if (current !== input.expectedRevision) throw new ReviewError('revision_conflict', current);
      await client.query(
        `INSERT INTO phs.review_policy(project_id, cadence, anchor_on, forecast_cycles, evidence_required, lead_validation_required, auto_tasks, updated_by)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (project_id) DO UPDATE SET cadence = $2, anchor_on = $3, forecast_cycles = $4, evidence_required = $5,
           lead_validation_required = $6, auto_tasks = $7, updated_by = $8, updated_at = now(), revision = phs.review_policy.revision + 1`,
        [projectId, input.cadence, input.nextDueOn, input.forecastCycles, input.evidenceRequired, input.leadValidationRequired, input.autoTasks, actor.userId]);
      const policy: PolicySnapshot = {
        cadence: input.cadence, forecastCycles: input.forecastCycles, evidenceRequired: input.evidenceRequired, leadValidationRequired: input.leadValidationRequired,
      };
      const dueOn = skipHolidays(input.nextDueOn, await this.holidays(client));
      const moved = await client.query(
        `UPDATE phs.review_cycle c SET due_on = $2, starts_on = least(c.starts_on, $4::date), policy_snapshot = $3
          WHERE c.project_id = $1 AND NOT EXISTS (SELECT 1 FROM phs.health_review r WHERE r.cycle_id = c.id)`,
        [projectId, dueOn, JSON.stringify(policy), input.nextDueOn]);
      if (!moved.rowCount) {
        await client.query('INSERT INTO phs.review_cycle(project_id, starts_on, due_on, policy_snapshot) VALUES($1, $2, $3, $4)',
          [projectId, project.today, dueOn, JSON.stringify(policy)]);
      }
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: before ? 'review_policy.updated' : 'review_policy.created', entityType: 'review_policy',
        entityId: projectId, projectId, before: before ? { cadence: before.cadence, anchorOn: before.anchor_on } : undefined,
        after: { cadence: input.cadence, nextDueOn: input.nextDueOn, forecastCycles: input.forecastCycles, evidenceRequired: input.evidenceRequired,
          leadValidationRequired: input.leadValidationRequired, autoTasks: input.autoTasks },
      });
    });
    // Alerts depend on the policy (automatic actions, overdue cycle), so they are brought up to date before answering.
    await this.governance.sync(projectId);
    return this.scheduleOf(this.pool, actor, capabilities, projectId);
  }

  // One draft per user and cycle. It survives reloads and new sessions and never mixes projects.
  async saveDraft(actor: Actor, cycleId: string, input: { expectedRevision: number; payload: DraftPayload }): Promise<CycleView> {
    const row = await this.cycleRow(this.pool, cycleId);
    const capabilities = await this.capabilities(actor, row.project_id);
    if (!capabilities.proposeAndReview) throw new ReviewError('forbidden');
    return withTransaction(this.pool, async (client) => {
      const view = await this.one(client, actor, capabilities, cycleId);
      if (!SUBMITTABLE.includes(view.status)) throw new ReviewError('review_already_submitted');
      if (!view.started) throw new ReviewError('cycle_not_started');
      const payload = JSON.stringify(input.payload);
      const written = input.expectedRevision === 0
        ? await client.query('INSERT INTO phs.review_draft(cycle_id, author_id, payload) VALUES($1, $2, $3) ON CONFLICT (cycle_id, author_id) DO NOTHING',
          [cycleId, actor.userId, payload])
        : await client.query(
          'UPDATE phs.review_draft SET payload = $3, revision = revision + 1, updated_at = now() WHERE cycle_id = $1 AND author_id = $2 AND revision = $4',
          [cycleId, actor.userId, payload, input.expectedRevision]);
      if (!written.rowCount) throw new ReviewError('revision_conflict', view.draft?.revision ?? 0);
      return this.one(client, actor, capabilities, cycleId);
    });
  }

  async submit(actor: Actor, cycleId: string, input: ReviewInput, idempotencyKey: string): Promise<CycleView> {
    if (input.nothingChanged ? input.topics.length > 0 : input.topics.length === 0) throw new ReviewError('invalid_request');
    if (new Set(input.topics).size !== input.topics.length) throw new ReviewError('invalid_request');
    if (input.topics.includes('client') && !input.clientClimate) throw new ReviewError('climate_required');
    const found = await this.cycleRow(this.pool, cycleId);
    const projectId = found.project_id;
    const capabilities = await this.capabilities(actor, projectId);
    if (!capabilities.proposeAndReview) throw new ReviewError('forbidden');
    // Expectations are worked out again now, not taken from what the form showed when it was opened.
    await this.governance.sync(projectId);
    let view: CycleView;
    try {
      view = await withTransaction(this.pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`review:${projectId}`]);
        const result = await runIdempotent(
          client,
          { service: 'health', userId: actor.userId, key: idempotencyKey, command: 'review.submit', payload: { cycleId, ...input } },
          async () => {
            const row = await this.cycleRow(client, cycleId);
            const before = await this.one(client, actor, capabilities, cycleId);
            if (!SUBMITTABLE.includes(before.status)) throw new ReviewError('review_already_submitted');
            // Checked on the server too: a client that calls the command directly gets the same answer.
            if (!before.started) throw new ReviewError('cycle_not_started');
            if (INACTIVE.includes(row.project_status)) throw new ReviewError('project_not_active');
            if (before.projectRevision !== input.expectedProjectRevision) throw new ReviewError('revision_conflict', before.projectRevision);
            if (input.nothingChanged && before.expectations.some((e) => e.blocking)) throw new ReviewError('nothing_changed_blocked');
            const support = input.supportText.trim();
            if (before.policy.evidenceRequired && !input.nothingChanged && !support) throw new ReviewError('support_required');
            const previous = before.reviews[0];
            const notes = Object.fromEntries(input.topics.filter((t) => input.notes[t]?.trim()).map((t) => [t, input.notes[t]!.trim()]));
            // Cost and effort reported in the review are recorded by Projects, as in the prototype. It is
            // the last step before writing: if anything fails afterwards the figures stay recorded and
            // sending again does not repeat them.
            const finance = input.topics.includes('finance') ? input.finance : null;
            if (finance) {
              const same = await client.query(
                `SELECT 1 FROM phs.financial_observation o
                  WHERE o.project_id = $1 AND o.effective_on = $2::date AND o.total_cost = $3::numeric
                    AND o.total_effort_hours IS NOT DISTINCT FROM $4::numeric
                    AND NOT EXISTS (SELECT 1 FROM phs.financial_observation c WHERE c.supersedes_id = o.id)`,
                [projectId, row.today, finance.totalCost, finance.totalEffortHours]);
              if (!same.rowCount) {
                const outcome = await this.projects.recordFinance(actor.identity, projectId, { effectiveOn: row.today, ...finance }, `review-finance:${idempotencyKey}`);
                if (outcome === 'forbidden') throw new ReviewError('forbidden');
                if (outcome === 'rejected') throw new ReviewError('finance_rejected');
              }
            }
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO phs.health_review(project_id, cycle_id, revision_no, supersedes_id, author_id, effective_on, nothing_changed, topics,
                                             client_climate, support_text, duration_seconds, submitted_data, expectations_snapshot)
               VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
              [projectId, cycleId, (previous?.revisionNo ?? 0) + 1, previous?.id ?? null, actor.userId, row.today, input.nothingChanged, input.topics,
                // The climate only changes when the PM reports on the client; otherwise the last known one stands.
                input.topics.includes('client') ? input.clientClimate : row.last_climate, support || null, input.activeSeconds,
                JSON.stringify({ notes, projectRevision: before.projectRevision, declaredConfidence: input.declaredConfidence, finance }), JSON.stringify(before.expectations)]);
            const reviewId = inserted.rows[0]!.id;
            await this.assessments.storeForReview(client, actor.userId, projectId, cycleId, reviewId);
            await client.query('DELETE FROM phs.review_draft WHERE cycle_id = $1 AND author_id = $2', [cycleId, actor.userId]);
            if (!previous) await this.scheduleNext(client, projectId, row);
            await insertAudit(client, {
              requestId: actor.requestId, actorId: actor.userId, action: 'review.submitted', entityType: 'health_review', entityId: reviewId, projectId,
              after: { cycleId, revisionNo: (previous?.revisionNo ?? 0) + 1, nothingChanged: input.nothingChanged, topics: input.topics },
            });
            await insertOutbox(client, { projectId, eventType: 'review.submitted', deduplicationKey: `review.submitted:${reviewId}`, payload: { projectId, cycleId, reviewId } });
            return { status: 201, body: await this.one(client, actor, capabilities, cycleId) };
          },
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ReviewError('idempotency_key_reused');
      throw error;
    }
    await this.governance.sync(projectId);
    return view;
  }

  // The next cycle starts the day after this one ends (or after a late review) and is due on the
  // first date of the schedule from then on, so the cut-off day never drifts (D03).
  private async scheduleNext(client: pg.PoolClient, projectId: string, cycle: CycleRow): Promise<void> {
    const policy = (await client.query<{ cadence: Cadence; anchor_on: string; forecast_cycles: number; evidence_required: boolean; lead_validation_required: boolean }>(
      'SELECT cadence, anchor_on::text AS anchor_on, forecast_cycles, evidence_required, lead_validation_required FROM phs.review_policy WHERE project_id = $1',
      [projectId])).rows[0];
    if (!policy) return;
    const startsOn = addDays(cycle.due_on > cycle.today ? cycle.due_on : cycle.today, 1);
    const dueOn = skipHolidays(firstDueOnOrAfter(policy.anchor_on, policy.cadence, startsOn), await this.holidays(client));
    await client.query(
      `INSERT INTO phs.review_cycle(project_id, starts_on, due_on, policy_snapshot) VALUES($1, $2, $3, $4) ON CONFLICT (project_id, starts_on) DO NOTHING`,
      [projectId, startsOn, dueOn, JSON.stringify({
        cadence: policy.cadence, forecastCycles: policy.forecast_cycles, evidenceRequired: policy.evidence_required,
        leadValidationRequired: policy.lead_validation_required,
      } satisfies PolicySnapshot)]);
  }

  // The lead decides on the submission they are looking at: a newer one makes this one stale.
  // Returning keeps the submission and opens a correction action for the PM (through the event sync).
  async validate(actor: Actor, reviewId: string, input: { decision: 'validated' | 'returned'; comment: string }): Promise<CycleView> {
    const review = (await this.pool.query<{ cycle_id: string; project_id: string }>(
      'SELECT cycle_id, project_id FROM phs.health_review WHERE id = $1', [reviewId])).rows[0];
    if (!review) throw new ReviewError('not_found');
    const capabilities = await this.capabilities(actor, review.project_id);
    if (!capabilities.decide) throw new ReviewError('forbidden');
    const view = await withTransaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`review:${review.project_id}`]);
      const before = await this.one(client, actor, capabilities, review.cycle_id);
      if (before.reviews[0]!.id !== reviewId) throw new ReviewError('stale_review');
      if (!before.policy.leadValidationRequired) throw new ReviewError('validation_not_required');
      const inserted = await client.query(
        'INSERT INTO phs.review_validation(review_id, decision, validator_id, comment) VALUES($1, $2, $3, $4) ON CONFLICT (review_id) DO NOTHING',
        [reviewId, input.decision, actor.userId, input.comment]);
      if (!inserted.rowCount) throw new ReviewError('already_decided');
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: `review.${input.decision}`, entityType: 'health_review', entityId: reviewId,
        projectId: review.project_id, after: { decision: input.decision, cycleId: review.cycle_id },
      });
      await insertOutbox(client, {
        projectId: review.project_id, eventType: `review.${input.decision}`, deduplicationKey: `review.decided:${reviewId}`,
        payload: { projectId: review.project_id, cycleId: review.cycle_id, reviewId },
      });
      return this.one(client, actor, capabilities, review.cycle_id);
    });
    await this.governance.sync(review.project_id);
    return view;
  }

  // The lead's inbox: submissions without a decision in the projects where this user decides.
  async pending(actor: Actor): Promise<CycleView[]> {
    const rows = await this.pool.query<CycleRow>(
      `${CYCLE_SELECT}
        JOIN LATERAL (SELECT r.id FROM phs.health_review r WHERE r.cycle_id = c.id ORDER BY r.revision_no DESC LIMIT 1) l ON true
       WHERE NOT EXISTS (SELECT 1 FROM phs.review_validation v WHERE v.review_id = l.id)
         AND coalesce((c.policy_snapshot->>'leadValidationRequired')::boolean, true)
       ORDER BY c.due_on, c.id`);
    const result: CycleView[] = [];
    const access = new Map<string, ProjectCapabilities | null>();
    for (const row of rows.rows) {
      if (!access.has(row.project_id)) access.set(row.project_id, (await this.projects.access(actor.identity, row.project_id))?.capabilities ?? null);
      const capabilities = access.get(row.project_id);
      if (capabilities?.decide) result.push(...await this.views(this.pool, actor, capabilities, [row]));
    }
    return result;
  }
}

function snapshot(value: Partial<PolicySnapshot>): PolicySnapshot {
  return {
    cadence: value.cadence ?? 'weekly', forecastCycles: value.forecastCycles ?? 2, evidenceRequired: value.evidenceRequired ?? true,
    leadValidationRequired: value.leadValidationRequired ?? true,
  };
}
