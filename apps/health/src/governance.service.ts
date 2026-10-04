import { assess } from '@phs/health-engine';
import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction, type ProjectCapabilities } from '@phs/service-kit';
import type pg from 'pg';
import type { AssessmentsService } from './assessments.service.js';
import type { ProjectsClient } from './projects.client.js';

type Severity = 'info' | 'warning' | 'critical';
type Priority = 'high' | 'medium' | 'low';
type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
interface Person { id: string; displayName: string }

export interface TaskView {
  id: string; projectId: string; projectName: string; eventId: string | null; title: string; description: string; owner: Person;
  dueOn: string; priority: Priority; status: TaskStatus; automatic: boolean; overdue: boolean; closedAt: string | null;
  closureNote: string | null; revision: number; canUpdate: boolean;
}
export interface ResponseView {
  id: string; revisionNo: number; cause: string; kind: 'remediation' | 'replan'; plan: string; changeId: string | null;
  submittedBy: Person; submittedAt: string;
  validation: { decision: 'validated' | 'returned'; validator: Person; decidedAt: string; comment: string } | null;
}
export interface EventView {
  id: string; ruleKey: string; severity: Severity; title: string; episode: number;
  target: { kind: 'milestone' | 'risk' | 'renewal' | 'change'; id: string } | null;
  openedAt: string; resolvedAt: string | null; resolutionNote: string | null;
  responseStatus: 'not_required' | 'missing' | 'pending' | 'returned' | 'validated';
  response: ResponseView | null; task: TaskView | null; canRespond: boolean; canValidate: boolean;
}
export interface Actor { userId: string; requestId: string; identity: string }

export type GovernanceErrorCode =
  | 'not_found' | 'forbidden' | 'change_required' | 'response_not_expected' | 'response_already_submitted' | 'already_decided'
  | 'responsible_not_enabled' | 'idempotency_key_reused' | 'revision_conflict' | 'invalid_transition' | 'note_required';
export class GovernanceError extends Error {
  constructor(readonly code: GovernanceErrorCode, readonly currentRevision?: number) {
    super(code);
  }
}

// D04: every critical alert needs its cause and a plan, validated by the lead.
const NEEDS_RESPONSE = new Set(['milestone_overdue', 'risk_mitigation_overdue', 'project_deviation', 'financial_deviation']);
const SYSTEM_RESOLUTION = 'La condición que originó el evento dejó de cumplirse.';
const SYSTEM_CLOSURE = 'Cerrada por el sistema: la condición que la originó dejó de cumplirse.';

// What is wrong right now. `key` identifies the condition across runs; the task follows the
// prototype's rule for owner, deadline and priority (D04).
interface Condition {
  ruleKey: string; key: string; severity: Severity; title: string;
  target?: { column: 'milestone_id' | 'risk_id' | 'renewal_id' | 'change_id'; id: string };
  task: { ownerId: string; days: number; priority: Priority; title: string; notAfter?: string };
}

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'blocked', 'completed', 'cancelled'],
  in_progress: ['pending', 'blocked', 'completed', 'cancelled'],
  blocked: ['pending', 'in_progress', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const TASK_SELECT = `
  SELECT t.id, t.project_id, p.name AS project_name, t.event_id, t.title, t.description, t.owner_id, u.display_name AS owner_name,
         t.due_on::text AS due_on, t.priority, t.status, t.automatic, t.closed_at, t.closure_note, t.revision,
         (t.status NOT IN ('completed','cancelled') AND t.due_on < (now() AT TIME ZONE p.timezone)::date) AS overdue
    FROM phs.health_task t JOIN phs.app_user u ON u.id = t.owner_id JOIN phs.project p ON p.id = t.project_id`;
interface TaskRow {
  id: string; project_id: string; project_name: string; event_id: string | null; title: string; description: string; owner_id: string;
  owner_name: string; due_on: string; priority: Priority; status: TaskStatus; automatic: boolean; closed_at: Date | null;
  closure_note: string | null; revision: string; overdue: boolean;
}
const toTask = (r: TaskRow, userId: string, capabilities?: ProjectCapabilities): TaskView => ({
  id: r.id, projectId: r.project_id, projectName: r.project_name, eventId: r.event_id, title: r.title, description: r.description,
  owner: { id: r.owner_id, displayName: r.owner_name }, dueOn: r.due_on, priority: r.priority, status: r.status, automatic: r.automatic,
  overdue: r.overdue, closedAt: r.closed_at?.toISOString() ?? null, closureNote: r.closure_note, revision: Number(r.revision),
  canUpdate: !['completed', 'cancelled'].includes(r.status) && (r.owner_id === userId || Boolean(capabilities?.editOperation)),
});

export class GovernanceService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly projects: ProjectsClient,
    private readonly assessments: AssessmentsService,
  ) {}

  private async capabilities(actor: Actor, projectId: string): Promise<ProjectCapabilities> {
    const access = await this.projects.access(actor.identity, projectId);
    if (!access) throw new GovernanceError('not_found');
    return access.capabilities;
  }

  private async conditions(client: pg.PoolClient, projectId: string): Promise<{ conditions: Condition[]; today: string; autoTasks: boolean }> {
    const project = (await client.query<{ pm_id: string; lead_id: string; today: string; auto_tasks: boolean | null }>(
      `SELECT p.pm_id, p.lead_id, (now() AT TIME ZONE p.timezone)::date::text AS today,
              (SELECT auto_tasks FROM phs.review_policy rp WHERE rp.project_id = p.id) AS auto_tasks
         FROM phs.project p WHERE p.id = $1`, [projectId])).rows[0]!;
    const conditions: Condition[] = [];
    const milestones = await client.query<{ id: string; title: string; owner_id: string; critical: boolean }>(
      `SELECT id, title, owner_id, critical FROM phs.milestone
        WHERE project_id = $1 AND status NOT IN ('completed','cancelled') AND due_on < $2::date ORDER BY due_on, id`, [projectId, project.today]);
    for (const m of milestones.rows) {
      conditions.push({
        ruleKey: 'milestone_overdue', key: `milestone_overdue:${m.id}`, severity: m.critical ? 'critical' : 'warning',
        title: `Hito vencido: ${m.title}`, target: { column: 'milestone_id', id: m.id },
        task: { ownerId: m.owner_id, days: 2, priority: 'high', title: `Atender el hito vencido: ${m.title}` },
      });
    }
    const risks = await client.query<{ id: string; title: string; owner_id: string; status: string; severity: number; overdue: boolean }>(
      `SELECT id, title, owner_id, status, probability * impact AS severity, mitigation_due_on < $2::date AS overdue
         FROM phs.risk WHERE project_id = $1 AND status IN ('open','mitigating','materialized') ORDER BY id`, [projectId, project.today]);
    for (const r of risks.rows) {
      if (r.status === 'materialized') {
        conditions.push({
          ruleKey: 'risk_materialized', key: `risk_materialized:${r.id}`, severity: 'critical', title: `Riesgo materializado: ${r.title}`,
          target: { column: 'risk_id', id: r.id },
          task: { ownerId: r.owner_id, days: 2, priority: 'high', title: `Gestionar el impacto del riesgo materializado: ${r.title}` },
        });
      } else if (r.overdue) {
        conditions.push({
          ruleKey: 'risk_mitigation_overdue', key: `risk_mitigation_overdue:${r.id}`, severity: r.severity >= 6 ? 'critical' : 'warning',
          title: `Mitigación vencida: ${r.title}`, target: { column: 'risk_id', id: r.id },
          task: { ownerId: r.owner_id, days: 2, priority: 'high', title: `Actualizar la mitigación vencida: ${r.title}` },
        });
      }
    }
    const loaded = await this.assessments.inputs(client, projectId);
    if (loaded) {
      const result = assess(loaded.input);
      const on = (key: string) => result.gates.some((g) => g.key === key && g.active);
      if (on('project_deviation')) {
        conditions.push({
          ruleKey: 'project_deviation', key: 'project_deviation', severity: 'critical',
          title: `Desviación de proyecto de ${Number(result.metrics.projectDeviation).toFixed(1)} puntos`,
          task: { ownerId: project.pm_id, days: 5, priority: 'high', title: 'Explicar y corregir la desviación de proyecto' },
        });
      }
      if (on('financial_deviation')) {
        conditions.push({
          ruleKey: 'financial_deviation', key: 'financial_deviation', severity: 'critical',
          title: `Desviación financiera de ${Number(result.metrics.financialDeviation).toFixed(1)}%`,
          task: { ownerId: project.pm_id, days: 5, priority: 'high', title: 'Explicar y corregir la desviación financiera' },
        });
      }
    }
    const renewals = await client.query<{ id: string; due_on: string; owner_id: string; days: number }>(
      `SELECT id, due_on::text AS due_on, owner_id, due_on - $2::date AS days FROM phs.renewal
        WHERE project_id = $1 AND status = 'pending' AND due_on - $2::date <= 45 ORDER BY due_on, id`, [projectId, project.today]);
    for (const r of renewals.rows) {
      conditions.push({
        ruleKey: 'renewal_due', key: `renewal_due:${r.id}`, severity: r.days < 0 ? 'critical' : r.days <= 15 ? 'warning' : 'info',
        title: r.days < 0 ? `Renovación vencida el ${r.due_on}` : `Renovación próxima el ${r.due_on}`, target: { column: 'renewal_id', id: r.id },
        // The deadline never goes past the renewal itself.
        task: { ownerId: r.owner_id, days: 10, priority: 'medium', title: `Gestionar la renovación del ${r.due_on}`, notAfter: r.due_on },
      });
    }
    const changes = await client.query<{ id: string; title: string }>(
      `SELECT c.id, c.title FROM phs.project_change c
        WHERE c.project_id = $1 AND NOT EXISTS (SELECT 1 FROM phs.change_decision d WHERE d.change_id = c.id) ORDER BY c.proposed_at, c.id`, [projectId]);
    for (const c of changes.rows) {
      conditions.push({
        ruleKey: 'change_pending', key: `change_pending:${c.id}`, severity: 'info', title: `Cambio pendiente de decisión: ${c.title}`,
        target: { column: 'change_id', id: c.id },
        task: { ownerId: project.lead_id, days: 7, priority: 'medium', title: `Decidir el cambio: ${c.title}` },
      });
    }
    return { conditions, today: project.today, autoTasks: project.auto_tasks ?? true };
  }

  // Brings events in line with what is wrong now: opens what is new (with its automatic action),
  // resolves what no longer applies, and leaves the rest as it is. Running it twice changes nothing.
  // Until the scheduled process exists (PHS-033) it runs whenever events or actions are consulted.
  async sync(projectId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      // One run at a time per project; the partial unique index is the second line of defence.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`events:${projectId}`]);
      const { conditions, today, autoTasks } = await this.conditions(client, projectId);
      for (const c of conditions) {
        const opened = await client.query<{ id: string }>(
          `INSERT INTO phs.health_event(project_id, rule_key, condition_key, episode, severity, title, ${c.target?.column ?? 'cycle_id'})
           SELECT $1, $2, $3, coalesce((SELECT max(episode) FROM phs.health_event WHERE project_id = $1 AND condition_key = $3), 0) + 1, $4, $5, $6
           ON CONFLICT (project_id, condition_key) WHERE resolved_at IS NULL DO NOTHING
           RETURNING id`,
          [projectId, c.ruleKey, c.key, c.severity, c.title, c.target?.id ?? null]);
        const eventId = opened.rows[0]?.id;
        if (!eventId) continue;
        await insertOutbox(client, { projectId, eventType: 'event.opened', deduplicationKey: `event.opened:${eventId}`, payload: { projectId, eventId, ruleKey: c.ruleKey } });
        if (!autoTasks) continue;
        const due = new Date(Date.parse(today) + c.task.days * 86_400_000).toISOString().slice(0, 10);
        const dueOn = c.task.notAfter && c.task.notAfter < due ? (c.task.notAfter < today ? today : c.task.notAfter) : due;
        await client.query(
          `INSERT INTO phs.health_task(project_id, event_id, title, owner_id, due_on, priority, automatic, automation_key)
           VALUES($1, $2, $3, $4, $5, $6, true, $7) ON CONFLICT (project_id, automation_key) DO NOTHING`,
          [projectId, eventId, c.task.title, c.task.ownerId, dueOn, c.task.priority, `event:${eventId}`]);
      }
      const resolved = await client.query<{ id: string }>(
        `UPDATE phs.health_event SET resolved_at = now(), resolution_note = $3
          WHERE project_id = $1 AND resolved_at IS NULL AND NOT (condition_key = ANY($2::text[])) RETURNING id`,
        [projectId, conditions.map((c) => c.key), SYSTEM_RESOLUTION]);
      if (resolved.rowCount) {
        // The cause is gone, so the action that only existed for it is closed too, by the system and saying so.
        const closed = await client.query<{ id: string }>(
          `UPDATE phs.health_task SET status = 'completed', closed_at = now(), closure_note = $3, revision = revision + 1
            WHERE project_id = $1 AND automatic AND event_id = ANY($2::uuid[]) AND status NOT IN ('completed','cancelled') RETURNING id`,
          [projectId, resolved.rows.map((r) => r.id), SYSTEM_CLOSURE]);
        for (const t of closed.rows) {
          await client.query(
            `INSERT INTO phs.activity(project_id, task_id, source, note, before_data, after_data) VALUES($1, $2, 'system', $3, '{}', $4)`,
            [projectId, t.id, SYSTEM_CLOSURE, JSON.stringify({ status: 'completed' })]);
        }
      }
    });
  }

  private async tasksOf(db: pg.Pool | pg.PoolClient, userId: string, capabilities: ProjectCapabilities | undefined, where: string, params: unknown[]): Promise<TaskView[]> {
    const found = await db.query<TaskRow>(`${TASK_SELECT} WHERE ${where} ORDER BY (t.status IN ('completed','cancelled')), t.due_on, t.created_at`, params);
    return found.rows.map((r) => toTask(r, userId, capabilities));
  }

  private async eventsOf(db: pg.Pool | pg.PoolClient, actor: Actor, capabilities: ProjectCapabilities, where: string, params: unknown[]): Promise<EventView[]> {
    const found = await db.query<{
      id: string; project_id: string; rule_key: string; severity: Severity; title: string; episode: number; milestone_id: string | null;
      risk_id: string | null; renewal_id: string | null; change_id: string | null; opened_at: Date; resolved_at: Date | null;
      resolution_note: string | null; response: (Omit<ResponseView, 'submittedAt' | 'validation'> & { submittedAt: string; validation: ResponseView['validation'] }) | null;
    }>(
      `SELECT e.id, e.project_id, e.rule_key, e.severity, e.title, e.episode, e.milestone_id, e.risk_id, e.renewal_id, e.change_id,
              e.opened_at, e.resolved_at, e.resolution_note,
              (SELECT jsonb_build_object(
                        'id', r.id, 'revisionNo', r.revision_no, 'cause', r.cause, 'kind', r.kind, 'plan', r.plan, 'changeId', r.change_id,
                        'submittedBy', jsonb_build_object('id', su.id, 'displayName', su.display_name),
                        'submittedAt', to_char(r.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'validation', CASE WHEN v.response_id IS NULL THEN NULL ELSE jsonb_build_object(
                           'decision', v.decision, 'validator', jsonb_build_object('id', vu.id, 'displayName', vu.display_name),
                           'decidedAt', to_char(v.decided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'comment', v.comment) END)
                 FROM phs.event_response r
                 JOIN phs.app_user su ON su.id = r.submitted_by
                 LEFT JOIN phs.event_response_validation v ON v.response_id = r.id
                 LEFT JOIN phs.app_user vu ON vu.id = v.validator_id
                WHERE r.event_id = e.id ORDER BY r.revision_no DESC LIMIT 1) AS response
         FROM phs.health_event e WHERE ${where}
        ORDER BY (e.resolved_at IS NOT NULL), array_position(ARRAY['critical','warning','info'], e.severity), e.opened_at DESC, e.condition_key`, params);
    const tasks = await this.tasksOf(db, actor.userId, capabilities, 't.event_id = ANY($1::uuid[]) AND t.automatic', [found.rows.map((e) => e.id)]);
    return found.rows.map((e) => {
      const kinds = [['milestone', e.milestone_id], ['risk', e.risk_id], ['renewal', e.renewal_id], ['change', e.change_id]] as const;
      const target = kinds.find(([, id]) => id !== null);
      const needs = NEEDS_RESPONSE.has(e.rule_key);
      const open = e.resolved_at === null;
      const status: EventView['responseStatus'] = !needs ? 'not_required'
        : !e.response ? 'missing' : !e.response.validation ? 'pending' : e.response.validation.decision;
      return {
        id: e.id, ruleKey: e.rule_key, severity: e.severity, title: e.title, episode: e.episode,
        target: target ? { kind: target[0], id: target[1]! } : null,
        openedAt: e.opened_at.toISOString(), resolvedAt: e.resolved_at?.toISOString() ?? null, resolutionNote: e.resolution_note,
        responseStatus: status, response: e.response, task: tasks.find((t) => t.eventId === e.id) ?? null,
        canRespond: open && needs && (status === 'missing' || status === 'returned') && (capabilities.proposeAndReview || capabilities.editOperation),
        canValidate: open && status === 'pending' && capabilities.decide,
      };
    });
  }

  async events(actor: Actor, projectId: string): Promise<EventView[]> {
    const capabilities = await this.capabilities(actor, projectId);
    await this.sync(projectId);
    return this.eventsOf(this.pool, actor, capabilities, 'e.project_id = $1', [projectId]);
  }

  private async event(db: pg.Pool | pg.PoolClient, actor: Actor, eventId: string): Promise<{ view: EventView; projectId: string; capabilities: ProjectCapabilities }> {
    const row = (await db.query<{ project_id: string }>('SELECT project_id FROM phs.health_event WHERE id = $1', [eventId])).rows[0];
    if (!row) throw new GovernanceError('not_found');
    const capabilities = await this.capabilities(actor, row.project_id);
    return { view: (await this.eventsOf(db, actor, capabilities, 'e.id = $1', [eventId]))[0]!, projectId: row.project_id, capabilities };
  }

  async respond(actor: Actor, eventId: string, input: { cause: string; kind: 'remediation' | 'replan'; plan: string; changeId: string | null }): Promise<EventView> {
    if ((input.kind === 'replan') !== (input.changeId !== null)) throw new GovernanceError('change_required');
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT 1 FROM phs.health_event WHERE id = $1 FOR UPDATE', [eventId]);
      const { view, projectId, capabilities } = await this.event(client, actor, eventId);
      if (!(capabilities.proposeAndReview || capabilities.editOperation)) throw new GovernanceError('forbidden');
      if (view.responseStatus === 'not_required' || view.resolvedAt) throw new GovernanceError('response_not_expected');
      if (!view.canRespond) throw new GovernanceError('response_already_submitted');
      if (input.changeId) {
        // Replanning a commitment is an approved change: the proposal must exist in this project.
        const change = await client.query('SELECT 1 FROM phs.project_change WHERE project_id = $1 AND id = $2', [projectId, input.changeId]);
        if (!change.rowCount) throw new GovernanceError('change_required');
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO phs.event_response(project_id, event_id, revision_no, cause, kind, plan, change_id, submitted_by)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [projectId, eventId, (view.response?.revisionNo ?? 0) + 1, input.cause, input.kind, input.plan, input.changeId, actor.userId]);
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: 'event.response_submitted', entityType: 'event_response',
        entityId: inserted.rows[0]!.id, projectId, after: { eventId, kind: input.kind, changeId: input.changeId },
      });
      return (await this.event(client, actor, eventId)).view;
    });
  }

  async validate(actor: Actor, responseId: string, input: { decision: 'validated' | 'returned'; comment: string }): Promise<EventView> {
    return withTransaction(this.pool, async (client) => {
      const row = (await client.query<{ event_id: string }>('SELECT event_id FROM phs.event_response WHERE id = $1', [responseId])).rows[0];
      if (!row) throw new GovernanceError('not_found');
      const { projectId, capabilities } = await this.event(client, actor, row.event_id);
      if (!capabilities.decide) throw new GovernanceError('forbidden');
      const inserted = await client.query(
        `INSERT INTO phs.event_response_validation(response_id, decision, validator_id, comment) VALUES($1, $2, $3, $4)
         ON CONFLICT (response_id) DO NOTHING`, [responseId, input.decision, actor.userId, input.comment]);
      if (!inserted.rowCount) throw new GovernanceError('already_decided');
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: `event.response_${input.decision}`, entityType: 'event_response',
        entityId: responseId, projectId, after: { decision: input.decision },
      });
      return (await this.event(client, actor, row.event_id)).view;
    });
  }

  async tasks(actor: Actor, projectId: string): Promise<TaskView[]> {
    const capabilities = await this.capabilities(actor, projectId);
    await this.sync(projectId);
    return this.tasksOf(this.pool, actor.userId, capabilities, 't.project_id = $1', [projectId]);
  }

  // The inbox: what is assigned to me and still open, wherever it is.
  mine(userId: string): Promise<TaskView[]> {
    return this.tasksOf(this.pool, userId, undefined, "t.owner_id = $1 AND t.status NOT IN ('completed','cancelled')", [userId]);
  }

  async createTask(
    actor: Actor, projectId: string,
    input: { title: string; description: string; ownerId: string; dueOn: string; priority: Priority; eventId: string | null },
    idempotencyKey: string,
  ): Promise<TaskView> {
    const capabilities = await this.capabilities(actor, projectId);
    if (!capabilities.editOperation) throw new GovernanceError('forbidden');
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'health', userId: actor.userId, key: idempotencyKey, command: 'task.create', payload: { projectId, ...input } },
          async () => {
            const owner = await client.query('SELECT 1 FROM phs.app_user WHERE id = $1 AND active', [input.ownerId]);
            if (!owner.rowCount) throw new GovernanceError('responsible_not_enabled');
            if (input.eventId) {
              const event = await client.query('SELECT 1 FROM phs.health_event WHERE project_id = $1 AND id = $2', [projectId, input.eventId]);
              if (!event.rowCount) throw new GovernanceError('not_found');
            }
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO phs.health_task(project_id, event_id, title, description, owner_id, due_on, priority, created_by)
               VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
              [projectId, input.eventId, input.title, input.description, input.ownerId, input.dueOn, input.priority, actor.userId]);
            const id = inserted.rows[0]!.id;
            await client.query(
              `INSERT INTO phs.activity(project_id, task_id, actor_id, source, note, before_data, after_data) VALUES($1, $2, $3, 'user', 'Acción creada', '{}', $4)`,
              [projectId, id, actor.userId, JSON.stringify({ status: 'pending', ownerId: input.ownerId, dueOn: input.dueOn })]);
            await insertAudit(client, { requestId: actor.requestId, actorId: actor.userId, action: 'task.created', entityType: 'health_task', entityId: id, projectId, after: { ...input } });
            return { status: 201, body: (await this.tasksOf(client, actor.userId, capabilities, 't.id = $1', [id]))[0]! };
          },
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new GovernanceError('idempotency_key_reused');
      throw error;
    }
  }

  async transitionTask(actor: Actor, taskId: string, input: { expectedRevision: number; to: TaskStatus; note?: string }): Promise<TaskView> {
    return withTransaction(this.pool, async (client) => {
      const row = (await client.query<{ project_id: string }>('SELECT project_id FROM phs.health_task WHERE id = $1 FOR UPDATE', [taskId])).rows[0];
      if (!row) throw new GovernanceError('not_found');
      // The owner can always reach the task through the project it belongs to.
      const capabilities = await this.capabilities(actor, row.project_id);
      const before = (await this.tasksOf(client, actor.userId, capabilities, 't.id = $1', [taskId]))[0]!;
      const closed = ['completed', 'cancelled'].includes(before.status);
      if (!closed && !before.canUpdate) throw new GovernanceError('forbidden');
      if (before.revision !== input.expectedRevision) throw new GovernanceError('revision_conflict', before.revision);
      if (!TRANSITIONS[before.status].includes(input.to)) throw new GovernanceError('invalid_transition');
      const closing = input.to === 'completed' || input.to === 'cancelled';
      if (closing && !input.note) throw new GovernanceError('note_required');
      await client.query(
        `UPDATE phs.health_task SET status = $2, closed_at = CASE WHEN $3 THEN now() END, closure_note = CASE WHEN $3 THEN $4 END,
                revision = revision + 1 WHERE id = $1`, [taskId, input.to, closing, input.note ?? null]);
      await client.query(
        `INSERT INTO phs.activity(project_id, task_id, actor_id, source, note, before_data, after_data) VALUES($1, $2, $3, 'user', $4, $5, $6)`,
        [row.project_id, taskId, actor.userId, input.note ?? `Estado: ${input.to}`, JSON.stringify({ status: before.status }), JSON.stringify({ status: input.to })]);
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: `task.${input.to}`, entityType: 'health_task', entityId: taskId,
        projectId: row.project_id, before: { status: before.status }, after: { status: input.to },
      });
      return (await this.tasksOf(client, actor.userId, capabilities, 't.id = $1', [taskId]))[0]!;
    });
  }
}
