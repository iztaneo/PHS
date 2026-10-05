import {
  FORECAST, RULE_SET_DEFINITION, RULE_SET_VERSION, assess, forecast, trend, type Assessment, type AssessmentInput, type Cut, type Forecast, type Trend,
} from '@phs/health-engine';
import type pg from 'pg';
import { dueDate, type Cadence } from './cadence.js';
import { NEEDS_RESPONSE } from './governance.service.js';
import type { ProjectsClient } from './projects.client.js';

// Where the project is heading: the trend between cycle cuts and the pressure of what is coming.
export interface OutlookView {
  projectId: string;
  today: string;
  trend: Trend;
  forecast: Forecast & {
    // `assumed`: the project has no review cycle, so the default horizon was used.
    horizon: { cadence: Cadence; cycles: number; until: string; assumed: boolean };
  };
}

export interface AssessmentView extends Assessment {
  projectId: string;
  // false: the project has no baseline yet, so the result is calculated but not kept as history.
  stored: boolean;
  kind: 'operational';
  publication: 'provisional' | 'official';
  effectiveOn: string;
  calculatedAt: string;
  projectRevision: number;
  financialsHidden: boolean;
}

const CADENCE_DAYS = { weekly: 7, fortnightly: 14, monthly: 30 } as const;

interface StoredRow {
  effective_on: string; calculated_at: Date; project_revision: string; publication: 'provisional' | 'official';
  score: string | null; weighted_score: string | null; gate_cap: string | null; confidence: string;
  dimension_results: {
    dimensions: Assessment['dimensions']; band: Assessment['band']; confidenceLevel: Assessment['confidence']['level'];
    // Absent in assessments stored before BIT-0026.
    confidenceDeductions?: Assessment['confidence']['deductions']; metrics: Assessment['metrics'];
  };
  gate_results: Assessment['gates']; version: string;
}

export class AssessmentsService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsClient) {}

  // Everything the engine needs, read in one snapshot so the inputs are consistent with each other.
  async inputs(client: pg.PoolClient | pg.Pool, projectId: string): Promise<{ input: AssessmentInput; revision: number; baselineId: string | null } | null> {
    const found = await client.query<{
      revision: string; today: string; baseline_id: string | null; budget: string | null; effort_hours: string | null;
      weights: Record<string, number> | null; client_contact: string; escalation_notes: string; members: number;
      cadence: keyof typeof CADENCE_DAYS | null; review_count: number; last_review_days: number | null;
      review_overdue_days: number | null; climate: 'good' | 'tense' | 'critical' | null; without_support: number;
      overdue_tasks: number; stale_changes: number; untreated_alerts: number; cost: string | null; effort_actual: string | null;
    }>(
      `WITH p AS (SELECT *, (now() AT TIME ZONE timezone)::date AS today FROM phs.project WHERE id = $1)
       SELECT p.revision, p.today::text AS today, b.id AS baseline_id, b.budget, b.effort_hours,
              (SELECT jsonb_object_agg(s.item->>'id', coalesce((s.item->>'weight')::numeric, 1))
                 FROM jsonb_array_elements(b.milestone_snapshot) AS s(item)) AS weights,
              p.client_contact, p.escalation_notes,
              (SELECT count(*)::int FROM phs.project_member m WHERE m.project_id = p.id) AS members,
              (SELECT cadence FROM phs.review_policy rp WHERE rp.project_id = p.id) AS cadence,
              (SELECT count(*)::int FROM phs.health_review r WHERE r.project_id = p.id) AS review_count,
              (SELECT p.today - max(r.effective_on) FROM phs.health_review r WHERE r.project_id = p.id) AS last_review_days,
              (SELECT p.today - min(c.due_on) FROM phs.review_cycle c
                WHERE c.project_id = p.id AND c.due_on < p.today
                  AND NOT EXISTS (SELECT 1 FROM phs.health_review r WHERE r.cycle_id = c.id)) AS review_overdue_days,
              (SELECT r.client_climate FROM phs.health_review r WHERE r.project_id = p.id ORDER BY r.submitted_at DESC LIMIT 1) AS climate,
              (SELECT count(*)::int FROM (SELECT support_text FROM phs.health_review r WHERE r.project_id = p.id
                                           ORDER BY r.submitted_at DESC LIMIT 3) x WHERE x.support_text IS NULL) AS without_support,
              (SELECT count(*)::int FROM phs.health_task t WHERE t.project_id = p.id
                AND t.status NOT IN ('completed','cancelled') AND t.due_on < p.today) AS overdue_tasks,
              (SELECT count(*)::int FROM phs.project_change c WHERE c.project_id = p.id AND c.proposed_at < now() - interval '14 days'
                AND NOT EXISTS (SELECT 1 FROM phs.change_decision d WHERE d.change_id = c.id)) AS stale_changes,
              (SELECT count(*)::int FROM phs.health_event e
                WHERE e.project_id = p.id AND e.resolved_at IS NULL AND e.severity = 'critical' AND e.rule_key = ANY($2::text[])
                  AND NOT EXISTS (
                    SELECT 1 FROM phs.event_response x LEFT JOIN phs.event_response_validation v ON v.response_id = x.id
                     WHERE x.event_id = e.id AND x.revision_no = (SELECT max(revision_no) FROM phs.event_response WHERE event_id = e.id)
                       AND coalesce(v.decision, 'pending') <> 'returned')) AS untreated_alerts,
              o.total_cost AS cost, o.total_effort_hours AS effort_actual
         FROM p
         LEFT JOIN phs.baseline b ON b.id = p.current_baseline_id
         LEFT JOIN LATERAL (
           SELECT total_cost, total_effort_hours FROM phs.financial_observation o
            WHERE o.project_id = p.id AND o.effective_on <= p.today
              AND NOT EXISTS (SELECT 1 FROM phs.financial_observation c WHERE c.supersedes_id = o.id)
            ORDER BY o.effective_on DESC, o.recorded_at DESC LIMIT 1) o ON true`, [projectId, [...NEEDS_RESPONSE]]);
    const p = found.rows[0];
    if (!p) return null;
    const milestones = await client.query<{ id: string; due_on: string; committed_due_on: string | null; status: AssessmentInput['milestones'][number]['status']; progress_pct: string | null; critical: boolean; completed_on: string | null }>(
      `SELECT id, due_on::text AS due_on, committed_due_on::text AS committed_due_on, status, progress_pct, critical,
              completed_on::text AS completed_on FROM phs.milestone WHERE project_id = $1 ORDER BY due_on, id`, [projectId]);
    const risks = await client.query<{ status: AssessmentInput['risks'][number]['status']; probability: number; impact: number; mitigation_due_on: string; risk_type: string; category: string }>(
      `SELECT status, probability, impact, mitigation_due_on::text AS mitigation_due_on, risk_type, category
         FROM phs.risk WHERE project_id = $1 ORDER BY id`, [projectId]);
    return {
      revision: Number(p.revision), baselineId: p.baseline_id,
      input: {
        today: p.today, hasBaseline: p.baseline_id !== null,
        milestones: milestones.rows.map((m) => ({
          dueOn: m.due_on, committedDueOn: m.committed_due_on, weight: Number(p.weights?.[m.id] ?? 1), status: m.status,
          progressPct: m.progress_pct === null ? null : Number(m.progress_pct), critical: m.critical, completedOn: m.completed_on,
        })),
        budget: p.budget, cost: p.cost, effortBudgetHours: p.effort_hours, effortActualHours: p.effort_actual,
        risks: risks.rows.map((r) => ({
          status: r.status, probability: r.probability, impact: r.impact, mitigationDueOn: r.mitigation_due_on,
          isClientRisk: r.risk_type === 'client' || r.category === 'client', isTeamRisk: r.category === 'team',
        })),
        client: { climate: p.climate, hasContact: p.client_contact.trim() !== '', hasEscalation: p.escalation_notes.trim() !== '' },
        governance: {
          cadenceDays: p.cadence ? CADENCE_DAYS[p.cadence] : null, reviewCount: p.review_count,
          daysSinceLastReview: p.last_review_days, reviewOverdueDays: Math.max(0, p.review_overdue_days ?? 0),
          overdueTasks: p.overdue_tasks, staleChanges: p.stale_changes,
          // What the review expects and is still untreated: critical alerts without cause and plan (PHS-027).
          completedWithoutRequiredEvidence: 0, lastReviewsWithoutSupport: p.without_support, unresolvedExpectations: p.untreated_alerts,
        },
        // The technical owner is mandatory on every project.
        team: { memberCount: p.members, hasTechnicalOwner: true, teamChangedInLastReview: false },
      },
    };
  }

  // Returns the assessment for the project's current revision and today's business date, calculating
  // and storing it the first time it is asked for. Until the scheduled process exists (PHS-033) this
  // is what keeps assessments up to date.
  async current(userId: string, signedIdentity: string, projectId: string): Promise<AssessmentView | null> {
    const access = await this.projects.access(signedIdentity, projectId);
    if (!access) return null;
    const view = await this.compute(userId, projectId);
    return view && !access.capabilities.seeFinancials ? hideFinancials(view) : view;
  }

  // The scheduled process keeps the assessment up to date without anyone asking for it (PHS-033).
  // It runs as the system, on behalf of the project's PM for the rule set's authorship.
  async materialize(projectId: string): Promise<void> {
    const pm = (await this.pool.query<{ pm_id: string }>('SELECT pm_id FROM phs.project WHERE id = $1', [projectId])).rows[0];
    if (pm) await this.compute(pm.pm_id, projectId);
  }

  private async compute(userId: string, projectId: string): Promise<AssessmentView | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const loaded = await this.inputs(client, projectId);
      if (!loaded) { await client.query('ROLLBACK'); return null; }
      const { input, revision, baselineId } = loaded;
      // Reviews and the treatment of alerts change the inputs without changing the project's revision,
      // so they are part of the key. `f2`: assessments stored from BIT-0026 on explain the confidence.
      const g = input.governance;
      const key = `operational:${projectId}:${revision}:${input.today}:${RULE_SET_VERSION}:f2:r${g.reviewCount}:a${g.unresolvedExpectations}`;
      let view: AssessmentView;
      if (baselineId === null) {
        view = { ...assess(input), projectId, stored: false, kind: 'operational', publication: 'provisional',
          effectiveOn: input.today, calculatedAt: new Date().toISOString(), projectRevision: revision, financialsHidden: false };
      } else {
        let row = await this.stored(client, key);
        if (!row) {
          await this.store(client, userId, projectId, baselineId, input, revision, key, null);
          row = (await this.stored(client, key))!;
        }
        view = {
          projectId, stored: true, kind: 'operational', publication: row.publication, effectiveOn: row.effective_on,
          calculatedAt: row.calculated_at.toISOString(), projectRevision: Number(row.project_revision), ruleSetVersion: row.version,
          score: row.score, weightedScore: row.weighted_score, gateCap: row.gate_cap, band: row.dimension_results.band,
          confidence: { value: row.confidence, level: row.dimension_results.confidenceLevel, deductions: row.dimension_results.confidenceDeductions ?? [] },
          dimensions: row.dimension_results.dimensions, gates: row.gate_results, metrics: row.dimension_results.metrics,
          financialsHidden: false,
        };
      }
      await client.query('COMMIT');
      return view;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async store(
    client: pg.PoolClient, userId: string, projectId: string, baselineId: string, input: AssessmentInput, revision: number, key: string,
    review: { cycleId: string; reviewId: string } | null,
  ): Promise<void> {
    const result = assess(input);
    await client.query(
      `INSERT INTO phs.rule_set(version, definition, engine_version, created_by) VALUES($1, $2, $3, $4)
       ON CONFLICT (version) DO NOTHING`,
      [RULE_SET_VERSION, JSON.stringify(RULE_SET_DEFINITION), RULE_SET_VERSION, userId]);
    // A retry or a concurrent request for the same key finds it taken and reuses the row.
    await client.query(
      `INSERT INTO phs.health_assessment(project_id, baseline_id, rule_set_id, effective_on, project_revision, assessment_kind,
                                         publication, score, weighted_score, gate_cap, confidence, dimension_results,
                                         gate_results, input_snapshot, forecast, idempotency_key, cycle_id, review_id)
       SELECT $1, $2, rs.id, $3, $4, $14, $15, $5, $6, $7, $8, $9, $10, $11, '{}', $12, $16, $17
         FROM phs.rule_set rs WHERE rs.version = $13
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [projectId, baselineId, input.today, revision, result.score, result.weightedScore, result.gateCap, result.confidence.value,
        JSON.stringify({
          dimensions: result.dimensions, band: result.band, confidenceLevel: result.confidence.level,
          confidenceDeductions: result.confidence.deductions, metrics: result.metrics,
        }),
        JSON.stringify(result.gates), JSON.stringify(input), key, RULE_SET_VERSION,
        review ? 'cycle' : 'operational', review ? 'official' : 'provisional', review?.cycleId ?? null, review?.reviewId ?? null]);
  }

  // D02: a review counts from the moment it is submitted, so its assessment is official at once.
  // Called inside the transaction that inserts the review. Without a baseline nothing is kept.
  async storeForReview(client: pg.PoolClient, userId: string, projectId: string, cycleId: string, reviewId: string): Promise<void> {
    const loaded = await this.inputs(client, projectId);
    if (!loaded || loaded.baselineId === null) return;
    await this.store(client, userId, projectId, loaded.baselineId, loaded.input, loaded.revision, `cycle:${reviewId}`, { cycleId, reviewId });
  }

  async outlook(signedIdentity: string, projectId: string): Promise<OutlookView | null> {
    const access = await this.projects.access(signedIdentity, projectId);
    if (!access) return null;
    const loaded = await this.inputs(this.pool, projectId);
    if (!loaded) return null;
    const today = loaded.input.today;
    // One cut per cycle: the official assessment of its latest submission.
    const cuts = await this.pool.query<Cut>(
      `SELECT c.due_on::text AS "cycleDueOn", a.effective_on::text AS "effectiveOn", a.score, rs.version AS "ruleSetVersion"
         FROM phs.review_cycle c
         JOIN LATERAL (SELECT r.id FROM phs.health_review r WHERE r.cycle_id = c.id ORDER BY r.revision_no DESC LIMIT 1) l ON true
         JOIN phs.health_assessment a ON a.review_id = l.id AND a.assessment_kind = 'cycle'
         JOIN phs.rule_set rs ON rs.id = a.rule_set_id
        WHERE c.project_id = $1 ORDER BY c.due_on DESC, c.starts_on DESC LIMIT 2`, [projectId]);
    const direction = trend(cuts.rows);
    const policy = (await this.pool.query<{ cadence: Cadence; forecast_cycles: number }>(
      'SELECT cadence, forecast_cycles FROM phs.review_policy WHERE project_id = $1', [projectId])).rows[0];
    const cadence = policy?.cadence ?? FORECAST.defaultCadence;
    const cycles = policy?.forecast_cycles ?? FORECAST.defaultCycles;
    const until = dueDate(today, cadence, cycles);
    const window = [projectId, today, until];
    const milestones = await this.pool.query<{ id: string; title: string; dueOn: string; critical: boolean }>(
      `SELECT id, title, due_on::text AS "dueOn", critical FROM phs.milestone
        WHERE project_id = $1 AND status NOT IN ('completed','cancelled') AND due_on BETWEEN $2::date AND $3::date ORDER BY due_on, id`, window);
    const risks = await this.pool.query<{ id: string; title: string; dueOn: string; severity: number }>(
      `SELECT id, title, mitigation_due_on::text AS "dueOn", probability * impact AS severity FROM phs.risk
        WHERE project_id = $1 AND status IN ('open','mitigating') AND mitigation_due_on BETWEEN $2::date AND $3::date ORDER BY mitigation_due_on, id`, window);
    const tasks = await this.pool.query<{ id: string; title: string; dueOn: string }>(
      `SELECT id, title, due_on::text AS "dueOn" FROM phs.health_task
        WHERE project_id = $1 AND status NOT IN ('completed','cancelled') AND due_on BETWEEN $2::date AND $3::date ORDER BY due_on, id`, window);
    const renewals = await this.pool.query<{ id: string; dueOn: string }>(
      `SELECT id, due_on::text AS "dueOn" FROM phs.renewal
        WHERE project_id = $1 AND status = 'pending' AND due_on BETWEEN $2::date AND $3::date ORDER BY due_on, id`, window);
    const now = assess(loaded.input);
    const gate = (key: string) => now.gates.some((g) => g.key === key && g.active);
    return {
      projectId, today, trend: direction,
      forecast: {
        ...forecast({
          score: now.score, milestones: milestones.rows, risks: risks.rows, tasks: tasks.rows, renewals: renewals.rows, trend: direction,
          projectDeviationGate: gate('project_deviation'), financialDeviationGate: gate('financial_deviation'),
        }),
        horizon: { cadence, cycles, until, assumed: !policy },
      },
    };
  }

  private async stored(client: pg.PoolClient, key: string): Promise<StoredRow | undefined> {
    const found = await client.query<StoredRow>(
      `SELECT a.effective_on::text AS effective_on, a.calculated_at, a.project_revision, a.publication, a.score, a.weighted_score,
              a.gate_cap, a.confidence, a.dimension_results, a.gate_results, rs.version
         FROM phs.health_assessment a JOIN phs.rule_set rs ON rs.id = a.rule_set_id WHERE a.idempotency_key = $1`, [key]);
    return found.rows[0];
  }
}

// Amounts are for those who govern the project (D05): others see the score, not the money behind it.
function hideFinancials(view: AssessmentView): AssessmentView {
  return {
    ...view, financialsHidden: true,
    metrics: { ...view.metrics, financialDeviation: null, effortDeviation: null },
    dimensions: view.dimensions.map((d) => (d.key === 'financial' ? { ...d, deductions: [] } : d)),
  };
}
