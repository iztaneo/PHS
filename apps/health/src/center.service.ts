import { assess } from '@phs/health-engine';
import type pg from 'pg';
import type { AssessmentsService } from './assessments.service.js';
import { NEEDS_RESPONSE } from './governance.service.js';
import type { ListedProject, ProjectsClient } from './projects.client.js';

type Severity = 'critical' | 'warning' | 'info';
type Tab = 'health' | 'reviews' | 'alerts' | 'milestones' | 'risks' | 'changes';

export interface CenterProject {
  id: string; code: string; name: string; status: string; practiceId: string; practiceName: string; clientName: string; pmName: string;
  // The user runs this project (PM); otherwise they govern or consult it.
  mine: boolean;
  // null score and band: "Sin evaluación", never shown as healthy. `assessed` false: the calculation failed.
  assessed: boolean; score: string | null; band: 'healthy' | 'attention' | 'risk' | null; confidenceLevel: 'high' | 'medium' | 'low' | null;
  review: { status: 'open' | 'overdue' | 'submitted' | 'returned'; dueOn: string } | null;
  counts: { criticalAlerts: number; overdueActions: number; upcomingMilestones: number; upcomingRisks: number; pendingDecisions: number };
}
export interface FocusItem {
  kind: 'review_overdue' | 'review_due' | 'review_returned' | 'review_to_validate' | 'change_to_decide' | 'response_to_validate'
    | 'alerts_untreated' | 'my_action' | 'project_at_risk' | 'project_in_attention' | 'low_confidence' | 'milestone_due' | 'risk_due';
  severity: Severity;
  projectId: string; projectName: string;
  // What it is about, when it is one thing: the action, the milestone, the change.
  subject: string | null;
  count: number;
  dueOn: string | null;
  tab: Tab;
}
export interface CenterView {
  today: string;
  projects: CenterProject[];
  focus: FocusItem[];
  // true: something could not be included, so the counts are not the whole picture.
  incomplete: boolean;
}

const SEVERITY: Severity[] = ['critical', 'warning', 'info'];
const SOON_DAYS = 7;

// The Health Center (PHS-035, PHS-036): what to attend today across the projects of the user's
// scope. Projects decides the scope; this only reads what belongs to those projects.
export class CenterService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly projects: ProjectsClient,
    private readonly assessments: AssessmentsService,
  ) {}

  async view(userId: string, signedIdentity: string): Promise<CenterView> {
    const listed = await this.projects.list(signedIdentity);
    const today = (await this.pool.query<{ today: string }>("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS today")).rows[0]!.today;
    // Closed projects are history, not work to attend.
    const scope = listed.projects.filter((p) => p.status !== 'closed');
    const ids = scope.map((p) => p.id);
    if (!ids.length) return { today, projects: [], focus: [], incomplete: listed.truncated };
    const by = new Map<string, ListedProject>(scope.map((p) => [p.id, p]));

    const numbers = await this.pool.query<{
      id: string; today: string; critical_alerts: number; responses_to_validate: number; overdue_actions: number; changes_pending: number;
      cycle_due: string | null; cycle_state: 'open' | 'submitted' | 'returned' | null; reviews_to_validate: number;
    }>(
      `SELECT p.id, (now() AT TIME ZONE p.timezone)::date::text AS today,
              (SELECT count(*)::int FROM phs.health_event e
                WHERE e.project_id = p.id AND e.resolved_at IS NULL AND e.severity = 'critical' AND e.rule_key = ANY($2::text[])
                  AND NOT EXISTS (
                    SELECT 1 FROM phs.event_response x LEFT JOIN phs.event_response_validation v ON v.response_id = x.id
                     WHERE x.event_id = e.id AND x.revision_no = (SELECT max(revision_no) FROM phs.event_response WHERE event_id = e.id)
                       AND coalesce(v.decision, 'pending') <> 'returned')) AS critical_alerts,
              (SELECT count(*)::int FROM phs.health_event e JOIN phs.event_response x ON x.event_id = e.id
                WHERE e.project_id = p.id AND e.resolved_at IS NULL
                  AND x.revision_no = (SELECT max(revision_no) FROM phs.event_response WHERE event_id = e.id)
                  AND NOT EXISTS (SELECT 1 FROM phs.event_response_validation v WHERE v.response_id = x.id)) AS responses_to_validate,
              (SELECT count(*)::int FROM phs.health_task t WHERE t.project_id = p.id AND t.status NOT IN ('completed','cancelled')
                AND t.due_on < (now() AT TIME ZONE p.timezone)::date) AS overdue_actions,
              (SELECT count(*)::int FROM phs.project_change c WHERE c.project_id = p.id
                AND NOT EXISTS (SELECT 1 FROM phs.change_decision d WHERE d.change_id = c.id)) AS changes_pending,
              cy.due_on::text AS cycle_due, cy.state AS cycle_state,
              (SELECT count(*)::int FROM phs.review_cycle c
                 JOIN LATERAL (SELECT r.id FROM phs.health_review r WHERE r.cycle_id = c.id ORDER BY r.revision_no DESC LIMIT 1) l ON true
                WHERE c.project_id = p.id AND coalesce((c.policy_snapshot->>'leadValidationRequired')::boolean, true)
                  AND NOT EXISTS (SELECT 1 FROM phs.review_validation v WHERE v.review_id = l.id)) AS reviews_to_validate
         FROM phs.project p
         LEFT JOIN LATERAL (
           -- The cycle the PM has to act on: a returned review first, then the one without a review.
           SELECT c.due_on, CASE WHEN l.id IS NULL THEN 'open' WHEN v.decision = 'returned' THEN 'returned' ELSE 'submitted' END AS state
             FROM phs.review_cycle c
             LEFT JOIN LATERAL (SELECT r.id FROM phs.health_review r WHERE r.cycle_id = c.id ORDER BY r.revision_no DESC LIMIT 1) l ON true
             LEFT JOIN phs.review_validation v ON v.review_id = l.id
            WHERE c.project_id = p.id AND c.starts_on <= (now() AT TIME ZONE p.timezone)::date AND (l.id IS NULL OR v.decision = 'returned'
                  OR (v.review_id IS NULL AND coalesce((c.policy_snapshot->>'leadValidationRequired')::boolean, true)))
            ORDER BY (v.decision = 'returned') DESC NULLS LAST, (l.id IS NULL) DESC, c.due_on LIMIT 1) cy ON true
        WHERE p.id = ANY($1::uuid[])`, [ids, [...NEEDS_RESPONSE]]);
    const soon = await this.pool.query<{ project_id: string; kind: 'milestone' | 'risk'; title: string; due_on: string; critical: boolean }>(
      `SELECT m.project_id, 'milestone' AS kind, m.title, m.due_on::text AS due_on, m.critical
         FROM phs.milestone m JOIN phs.project p ON p.id = m.project_id
        WHERE m.project_id = ANY($1::uuid[]) AND m.status NOT IN ('completed','cancelled')
          AND m.due_on BETWEEN (now() AT TIME ZONE p.timezone)::date AND (now() AT TIME ZONE p.timezone)::date + $2::int
       UNION ALL
       SELECT r.project_id, 'risk', r.title, r.mitigation_due_on::text, r.probability * r.impact >= 6
         FROM phs.risk r JOIN phs.project p ON p.id = r.project_id
        WHERE r.project_id = ANY($1::uuid[]) AND r.status IN ('open','mitigating')
          AND r.mitigation_due_on BETWEEN (now() AT TIME ZONE p.timezone)::date AND (now() AT TIME ZONE p.timezone)::date + $2::int
        ORDER BY due_on, title`, [ids, SOON_DAYS]);
    const actions = await this.pool.query<{ project_id: string; title: string; due_on: string; overdue: boolean; priority: string }>(
      `SELECT t.project_id, t.title, t.due_on::text AS due_on, t.due_on < (now() AT TIME ZONE p.timezone)::date AS overdue, t.priority
         FROM phs.health_task t JOIN phs.project p ON p.id = t.project_id
        WHERE t.project_id = ANY($1::uuid[]) AND t.owner_id = $2 AND t.status NOT IN ('completed','cancelled')
          AND t.due_on <= (now() AT TIME ZONE p.timezone)::date + $3::int ORDER BY t.due_on, t.title`, [ids, userId, SOON_DAYS]);

    let incomplete = listed.truncated;
    const focus: FocusItem[] = [];
    const projects: CenterProject[] = [];
    for (const row of numbers.rows) {
      const p = by.get(row.id)!;
      const pm = p.capabilities.proposeAndReview;
      const decides = p.capabilities.decide;
      const active = !['paused'].includes(p.status);
      const add = (kind: FocusItem['kind'], severity: Severity, tab: Tab, extra: Partial<FocusItem> = {}) => {
        focus.push({ kind, severity, tab, projectId: p.id, projectName: p.name, subject: null, count: 1, dueOn: null, ...extra });
      };
      let result: ReturnType<typeof assess> | null = null;
      try {
        const loaded = await this.assessments.inputs(this.pool, p.id);
        result = loaded ? assess(loaded.input) : null;
      } catch {
        // One project failing must not hide the others, nor pass as a complete picture.
        incomplete = true;
      }
      const upcoming = soon.rows.filter((s) => s.project_id === p.id);
      const review = row.cycle_due && row.cycle_state
        ? { status: row.cycle_state === 'open' && row.cycle_due < row.today ? 'overdue' as const : row.cycle_state, dueOn: row.cycle_due } : null;
      projects.push({
        id: p.id, code: p.code, name: p.name, status: p.status, practiceId: p.practiceId, practiceName: p.practiceName, clientName: p.clientName,
        pmName: p.pmName, mine: pm, assessed: result !== null, score: result?.score ?? null, band: result?.band ?? null,
        confidenceLevel: result?.confidence.level ?? null, review: active ? review : null,
        counts: {
          criticalAlerts: row.critical_alerts, overdueActions: row.overdue_actions,
          upcomingMilestones: upcoming.filter((s) => s.kind === 'milestone').length, upcomingRisks: upcoming.filter((s) => s.kind === 'risk').length,
          pendingDecisions: decides ? row.reviews_to_validate + row.changes_pending + row.responses_to_validate : 0,
        },
      });

      // What the PM has to do.
      if (pm && active && review) {
        if (review.status === 'overdue') add('review_overdue', 'critical', 'reviews', { dueOn: review.dueOn });
        else if (review.status === 'returned') add('review_returned', 'warning', 'reviews', { dueOn: review.dueOn });
        else if (review.status === 'open' && daysBetween(row.today, review.dueOn) <= 2) add('review_due', 'warning', 'reviews', { dueOn: review.dueOn });
      }
      if ((pm || p.capabilities.editOperation) && row.critical_alerts > 0) add('alerts_untreated', 'critical', 'alerts', { count: row.critical_alerts });
      if (pm) {
        for (const s of upcoming) {
          add(s.kind === 'milestone' ? 'milestone_due' : 'risk_due', s.critical ? 'warning' : 'info', s.kind === 'milestone' ? 'milestones' : 'risks', { subject: s.title, dueOn: s.due_on });
        }
      }
      // What the lead has to decide.
      if (decides) {
        if (row.reviews_to_validate > 0) add('review_to_validate', 'warning', 'reviews', { count: row.reviews_to_validate });
        if (row.changes_pending > 0) add('change_to_decide', 'warning', 'changes', { count: row.changes_pending });
        if (row.responses_to_validate > 0) add('response_to_validate', 'warning', 'alerts', { count: row.responses_to_validate });
      }
      // Where those who govern should look: never for the PM's own project, who already sees the causes above.
      if (!pm || decides) {
        if (result?.band === 'risk') add('project_at_risk', 'critical', 'health', { subject: result.score });
        else if (result?.band === 'attention') add('project_in_attention', 'warning', 'health', { subject: result.score });
        if (result && result.score !== null && result.confidence.level === 'low') add('low_confidence', 'warning', 'health', { subject: result.confidence.value });
        if (!pm && active && review?.status === 'overdue') add('review_overdue', 'warning', 'reviews', { dueOn: review.dueOn });
      }
    }
    // Actions assigned to me, whatever my role in the project.
    for (const a of actions.rows) {
      focus.push({
        kind: 'my_action', severity: a.overdue ? 'critical' : a.priority === 'high' ? 'warning' : 'info', tab: 'alerts', projectId: a.project_id,
        projectName: by.get(a.project_id)!.name, subject: a.title, count: 1, dueOn: a.due_on,
      });
    }
    focus.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity)
      || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.projectName.localeCompare(b.projectName) || a.kind.localeCompare(b.kind));
    projects.sort((a, b) => Number(a.score ?? 101) - Number(b.score ?? 101) || a.name.localeCompare(b.name));
    return { today, projects, focus, incomplete };
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
