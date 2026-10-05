import type pg from 'pg';
import type { ProjectsClient } from './projects.client.js';

export const HISTORY_CATEGORIES = ['project', 'milestone', 'risk', 'change', 'review', 'alert', 'action', 'evaluation', 'finance', 'renewal', 'evidence'] as const;
export type HistoryCategory = typeof HISTORY_CATEGORIES[number];

export interface HistoryEntry {
  id: string;
  occurredAt: string;
  category: HistoryCategory;
  action: string;
  title: string;
  // Reason, comment or the values that matter; null when there is nothing to add.
  detail: string | null;
  // null: the system did it.
  actor: string | null;
}
export interface HistoryPage { items: HistoryEntry[]; nextCursor: string | null }
export interface HistoryQuery { category?: HistoryCategory; from?: string; to?: string; cursor?: string; limit: number }

type Tab = 'card' | 'milestones' | 'risks' | 'alerts' | 'reviews' | 'changes' | 'baseline';
export interface TimelineItem {
  kind: 'milestone' | 'risk' | 'action' | 'renewal' | 'review' | 'project_end' | 'baseline' | 'change' | 'status';
  title: string;
  date: string;
  critical: boolean;
  tab: Tab;
}
export interface TimelineView {
  today: string;
  // How far ahead "upcoming" looks: the cycles the project forecasts, or four weeks when it has no cycle.
  horizon: { until: string; cycles: number; cadence: 'weekly' | 'fortnightly' | 'monthly'; assumed: boolean };
  past: TimelineItem[];
  overdue: TimelineItem[];
  upcoming: TimelineItem[];
}
export interface Actor { userId: string; identity: string }

// audit_entry.action prefix -> what the entry is about.
const CATEGORY_SQL = `CASE split_part(action, '.', 1)
  WHEN 'milestone' THEN 'milestone' WHEN 'risk' THEN 'risk' WHEN 'change' THEN 'change' WHEN 'review' THEN 'review'
  WHEN 'review_policy' THEN 'review' WHEN 'event' THEN 'alert' WHEN 'task' THEN 'action' WHEN 'assessment' THEN 'evaluation'
  WHEN 'finance' THEN 'finance' WHEN 'renewal' THEN 'renewal' WHEN 'evidence' THEN 'evidence' ELSE 'project' END`;

const TITLES: Record<string, string> = {
  'project.created': 'Proyecto creado', 'project.updated': 'Ficha del proyecto actualizada', 'project.status_changed': 'Cambio de estado del proyecto',
  'project.status_justified': 'Situación del proyecto justificada', 'member.added': 'Integrante agregado al equipo', 'member.updated': 'Integrante actualizado',
  'member.removed': 'Integrante retirado del equipo', 'baseline.published': 'Línea base publicada',
  'milestone.created': 'Hito registrado', 'milestone.updated': 'Hito actualizado', 'milestone.in_progress': 'Hito en curso', 'milestone.completed': 'Hito completado',
  'milestone.rescheduled': 'Hito reprogramado', 'milestone.cancelled': 'Hito cancelado', 'milestone.pending': 'Hito reabierto',
  'risk.created': 'Riesgo registrado', 'risk.updated': 'Riesgo actualizado', 'risk.open': 'Riesgo reabierto', 'risk.mitigating': 'Riesgo en mitigación',
  'risk.mitigated': 'Riesgo mitigado', 'risk.materialized': 'Riesgo materializado', 'risk.closed': 'Riesgo cerrado',
  'change.proposed': 'Cambio propuesto', 'change.approved': 'Cambio aprobado', 'change.rejected': 'Cambio rechazado',
  'review_policy.created': 'Ciclo de revisión configurado', 'review_policy.updated': 'Ciclo de revisión modificado',
  'review.submitted': 'Revisión enviada', 'review.validated': 'Revisión validada', 'review.returned': 'Revisión devuelta',
  'event.opened': 'Alerta abierta', 'event.resolved': 'Alerta resuelta', 'event.response_submitted': 'Causa y plan registrados',
  'event.response_validated': 'Causa y plan validados', 'event.response_returned': 'Causa y plan devueltos',
  'task.created': 'Acción creada', 'task.pending': 'Acción pendiente', 'task.in_progress': 'Acción en curso', 'task.blocked': 'Acción bloqueada',
  'task.completed': 'Acción completada', 'task.cancelled': 'Acción cancelada',
  'assessment.cycle': 'Evaluación oficial del ciclo',
  'finance.recorded': 'Costo y esfuerzo registrados', 'finance.corrected': 'Costo y esfuerzo corregidos',
  'renewal.created': 'Renovación registrada', 'renewal.renewed': 'Renovación realizada', 'renewal.cancelled': 'Renovación cancelada',
  'evidence.added': 'Evidencia agregada', 'evidence.addendum_added': 'Adenda de evidencia agregada', 'evidence.withdrawn': 'Evidencia retirada',
};
const STATUS: Record<string, string> = { planned: 'planeado', active: 'activo', paused: 'pausado', renewing: 'en renovación', closed: 'cerrado' };
const TARGET: Record<string, string> = { milestone: 'un hito', risk: 'un riesgo', change: 'un cambio', review: 'una revisión' };
const BAND: Record<string, string> = { healthy: 'saludable', attention: 'en atención', risk: 'en riesgo' };

type Data = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

// What to say about an entry beyond its title. Amounts only for those who may see the economy (D05).
function describe(action: string, before: Data, after: Data, subject: string | null, seeFinancials: boolean): string | null {
  const parts: (string | null)[] = [];
  const reason = text(after.reason) ?? text(after.comment) ?? text(after.note);
  switch (action) {
    case 'project.status_changed':
      parts.push(`${before.status ? `De ${STATUS[String(before.status)] ?? before.status} a ` : 'A '}${STATUS[String(after.status)] ?? after.status}`, reason);
      break;
    case 'baseline.published':
      parts.push(`Versión ${after.version}`, typeof after.milestones === 'number' ? `${after.milestones} hitos comprometidos` : null);
      break;
    case 'change.proposed': case 'change.approved': case 'change.rejected':
      parts.push(text(after.title) ?? subject, after.baselineVersion && action === 'change.approved' ? `nueva línea base versión ${after.baselineVersion}` : null, reason);
      break;
    case 'review.submitted':
      parts.push(`Versión ${after.revisionNo}`, after.nothingChanged ? 'nada cambió' : Array.isArray(after.topics) && after.topics.length ? `${after.topics.length} tema(s)` : null);
      break;
    case 'assessment.cycle':
      parts.push(after.score === null ? 'Sin evaluación' : `Score ${Number(after.score).toFixed(0)}${after.band ? `, ${BAND[String(after.band)]}` : ''}`,
        `confianza ${Number(after.confidence).toFixed(0)}`, `línea base versión ${after.baselineVersion}`, `reglas ${after.ruleSet}`, `ciclo del ${after.cycleDueOn}`);
      break;
    case 'finance.recorded': case 'finance.corrected':
      parts.push(seeFinancials ? `Costo acumulado ${after.totalCost}${after.totalEffortHours ? `, esfuerzo ${after.totalEffortHours} h` : ''} al ${after.effectiveOn}` : 'Cifras no visibles para tu perfil',
        text(after.source));
      break;
    case 'evidence.added': case 'evidence.addendum_added':
      parts.push(`En ${TARGET[String(after.target)] ?? 'un elemento'}`, after.mime ? 'con archivo' : 'solo texto');
      break;
    case 'event.opened': case 'event.resolved':
      parts.push(text(after.title), action === 'event.opened' && after.severity === 'critical' ? 'crítica' : null, action === 'event.resolved' ? text(after.note) : null);
      break;
    case 'review_policy.created': case 'review_policy.updated':
      parts.push(after.cadence ? `Cadencia ${{ weekly: 'semanal', fortnightly: 'quincenal', monthly: 'mensual' }[String(after.cadence)]}` : null,
        after.nextDueOn ? `próxima revisión ${after.nextDueOn}` : null);
      break;
    default:
      parts.push(text(after.title) ?? subject, reason);
  }
  const said = parts.filter((p): p is string => Boolean(p));
  return said.length ? said.join(' · ') : null;
}

// Reconstructs how a project evolved (PHS-038). Platform reads what every service recorded:
// the audit trail, the alerts and the official assessments of each cycle.
export class HistoryService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsClient) {}

  // Newest first, in a stable order, a page at a time: nothing is cut off, the caller asks for more.
  async history(actor: Actor, projectId: string, query: HistoryQuery): Promise<HistoryPage | null> {
    const capabilities = await this.projects.capabilities(actor.identity, projectId);
    if (!capabilities) return null;
    let after: [string, string] | null = null;
    if (query.cursor) {
      const [at, key] = Buffer.from(query.cursor, 'base64url').toString('utf8').split('|');
      if (!at || !key || Number.isNaN(Date.parse(at))) return { items: [], nextCursor: null };
      after = [at, key];
    }
    const found = await this.pool.query<{
      key: string; occurred_at: Date; at: string; action: string; category: HistoryCategory; actor: string | null;
      before_data: Data | null; after_data: Data | null; subject: string | null;
    }>(
      `WITH feed AS (
         SELECT 'a' || lpad(a.id::text, 20, '0') AS key, a.occurred_at, a.action, u.display_name AS actor, a.before_data, a.after_data,
                coalesce(t.title, c.title) AS subject
           FROM phs.audit_entry a
           LEFT JOIN phs.app_user u ON u.id = a.actor_id
           LEFT JOIN phs.health_task t ON a.entity_type = 'health_task' AND t.id::text = a.entity_id
           LEFT JOIN phs.project_change c ON a.entity_type = 'project_change' AND c.id::text = a.entity_id
          WHERE a.project_id = $1
         UNION ALL
         SELECT 'e' || e.id::text, e.opened_at, 'event.opened', NULL, NULL, jsonb_build_object('title', e.title, 'severity', e.severity), NULL
           FROM phs.health_event e WHERE e.project_id = $1
         UNION ALL
         SELECT 'r' || e.id::text, e.resolved_at, 'event.resolved', NULL, NULL, jsonb_build_object('title', e.title, 'note', e.resolution_note), NULL
           FROM phs.health_event e WHERE e.project_id = $1 AND e.resolved_at IS NOT NULL
         UNION ALL
         SELECT 's' || s.id::text, s.calculated_at, 'assessment.cycle', NULL, NULL,
                jsonb_build_object('score', s.score, 'band', s.dimension_results->>'band', 'confidence', s.confidence, 'baselineVersion', b.version,
                                   'ruleSet', rs.version, 'cycleDueOn', cy.due_on), NULL
           FROM phs.health_assessment s
           JOIN phs.baseline b ON b.id = s.baseline_id JOIN phs.rule_set rs ON rs.id = s.rule_set_id JOIN phs.review_cycle cy ON cy.id = s.cycle_id
          WHERE s.project_id = $1 AND s.assessment_kind = 'cycle'
       ), tagged AS (SELECT *, ${CATEGORY_SQL} AS category FROM feed)
       SELECT key, occurred_at, to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at, action, category, actor, before_data, after_data, subject
         FROM tagged
        WHERE ($2::text IS NULL OR category = $2)
          AND ($3::date IS NULL OR occurred_at >= $3::date)
          AND ($4::date IS NULL OR occurred_at < $4::date + 1)
          AND ($5::timestamptz IS NULL OR (occurred_at, key) < ($5::timestamptz, $6::text))
        ORDER BY occurred_at DESC, key DESC LIMIT $7`,
      [projectId, query.category ?? null, query.from ?? null, query.to ?? null, after?.[0] ?? null, after?.[1] ?? null, query.limit + 1]);
    const rows = found.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return {
      items: rows.map((r) => ({
        id: r.key, occurredAt: r.occurred_at.toISOString(), category: r.category, action: r.action, title: TITLES[r.action] ?? r.action,
        detail: describe(r.action, r.before_data ?? {}, r.after_data ?? {}, r.subject, capabilities.seeFinancials), actor: r.actor,
      })),
      // The cursor keeps the microseconds of the database so no entry is skipped or repeated.
      nextCursor: found.rows.length > query.limit && last ? Buffer.from(`${last.at}|${last.key}`, 'utf8').toString('base64url') : null,
    };
  }

  // Past, present and future on one line: what happened lately, what is overdue today and what
  // falls due within the horizon of the project's review cycles.
  async timeline(actor: Actor, projectId: string): Promise<TimelineView | null> {
    if (!(await this.projects.capabilities(actor.identity, projectId))) return null;
    const head = (await this.pool.query<{ today: string; until: string; cycles: number; cadence: 'weekly' | 'fortnightly' | 'monthly'; assumed: boolean; ends_on: string }>(
      `SELECT t.today::text AS today, p.ends_on::text AS ends_on, coalesce(rp.forecast_cycles, 2)::int AS cycles, coalesce(rp.cadence, 'fortnightly') AS cadence,
              rp.project_id IS NULL AS assumed,
              (CASE coalesce(rp.cadence, 'fortnightly')
                 WHEN 'weekly' THEN t.today + 7 * coalesce(rp.forecast_cycles, 2)
                 WHEN 'monthly' THEN (t.today + make_interval(months => coalesce(rp.forecast_cycles, 2)::int))::date
                 ELSE t.today + 14 * coalesce(rp.forecast_cycles, 2) END)::text AS until
         FROM phs.project p
         CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE p.timezone)::date AS today) t
         LEFT JOIN phs.review_policy rp ON rp.project_id = p.id
        WHERE p.id = $1`, [projectId])).rows[0];
    if (!head) return null;
    const commitments = await this.pool.query<TimelineItem>(
      `SELECT * FROM (
         SELECT 'milestone' AS kind, m.title, m.due_on::text AS date, m.critical, 'milestones' AS tab FROM phs.milestone m
          WHERE m.project_id = $1 AND m.status NOT IN ('completed','cancelled')
         UNION ALL
         SELECT 'risk', 'Mitigación: ' || r.title, r.mitigation_due_on::text, r.probability * r.impact >= 6, 'risks' FROM phs.risk r
          WHERE r.project_id = $1 AND r.status IN ('open','mitigating')
         UNION ALL
         SELECT 'action', k.title, k.due_on::text, k.priority = 'high', 'alerts' FROM phs.health_task k
          WHERE k.project_id = $1 AND k.status NOT IN ('completed','cancelled')
         UNION ALL
         SELECT 'renewal', 'Renovación', n.due_on::text, true, 'card' FROM phs.renewal n WHERE n.project_id = $1 AND n.status = 'pending'
         UNION ALL
         SELECT 'review', 'Revisión del ciclo', c.due_on::text, false, 'reviews' FROM phs.review_cycle c
          WHERE c.project_id = $1 AND NOT EXISTS (SELECT 1 FROM phs.health_review r WHERE r.cycle_id = c.id)
         UNION ALL
         SELECT 'project_end', 'Fin de la vigencia del proyecto', p.ends_on::text, true, 'card' FROM phs.project p
          WHERE p.id = $1 AND p.status <> 'closed' AND p.ends_on >= $2::date
       ) x WHERE date <= $3::text ORDER BY date, kind, title`, [projectId, head.today, head.until]);
    const past = await this.pool.query<TimelineItem>(
      `SELECT * FROM (
         SELECT 'milestone' AS kind, 'Hito completado: ' || m.title AS title, m.completed_on::text AS date, m.critical, 'milestones' AS tab FROM phs.milestone m
          WHERE m.project_id = $1 AND m.completed_on IS NOT NULL
         UNION ALL
         SELECT 'review', 'Revisión enviada', r.effective_on::text, false, 'reviews' FROM phs.health_review r WHERE r.project_id = $1
         UNION ALL
         SELECT 'baseline', 'Línea base versión ' || b.version, (b.created_at AT TIME ZONE p.timezone)::date::text, false, 'baseline'
           FROM phs.baseline b JOIN phs.project p ON p.id = b.project_id WHERE b.project_id = $1
         UNION ALL
         SELECT 'change', CASE d.decision WHEN 'approved' THEN 'Cambio aprobado: ' ELSE 'Cambio rechazado: ' END || c.title,
                (d.decided_at AT TIME ZONE p.timezone)::date::text, false, 'changes'
           FROM phs.change_decision d JOIN phs.project_change c ON c.id = d.change_id JOIN phs.project p ON p.id = c.project_id WHERE c.project_id = $1
         UNION ALL
         SELECT 'status', 'Estado del proyecto: ' || l.to_status, (l.recorded_at AT TIME ZONE p.timezone)::date::text, false, 'card'
           FROM phs.project_status_log l JOIN phs.project p ON p.id = l.project_id WHERE l.project_id = $1 AND l.kind = 'transition'
       ) x WHERE date >= ($2::date - 60)::text AND date <= $2::text ORDER BY date DESC, kind, title`, [projectId, head.today]);
    return {
      today: head.today, horizon: { until: head.until, cycles: head.cycles, cadence: head.cadence, assumed: head.assumed },
      past: past.rows.map((r) => (r.kind === 'status' ? { ...r, title: `Estado del proyecto: ${STATUS[r.title.split(': ')[1]!] ?? r.title}` } : r)),
      overdue: commitments.rows.filter((c) => c.date < head.today),
      upcoming: commitments.rows.filter((c) => c.date >= head.today),
    };
  }
}
