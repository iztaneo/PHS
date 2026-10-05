import { randomUUID } from 'node:crypto';
import { healthEvent, task as taskSchema } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssessmentsService } from '../src/assessments.service.js';
import { GovernanceService } from '../src/governance.service.js';
import type { ProjectsClient } from '../src/projects.client.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.HEALTH_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
// The calendar day in the projects' time zone, not in UTC: after 18:00 in Mexico they differ.
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
const day = (offset: number) => localDate.format(new Date(Date.now() + offset * 86_400_000));
const NONE: ProjectCapabilities = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: false };
const PM: ProjectCapabilities = { ...NONE, editOperation: true, proposeAndReview: true, seeFinancials: true };
const LEAD: ProjectCapabilities = { ...NONE, editOperation: true, decide: true, seeFinancials: true };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('events, responses and actions (PHS-030 to PHS-032, D04)', () => {
  // identity "pm" / "lead" / "viewer" / "none" selects what the Projects stub answers.
  const roles: Record<string, ProjectCapabilities | null> = { pm: PM, lead: LEAD, viewer: NONE, none: null };
  const projects = { access: async (identity: string, projectId: string) => (roles[identity] ? { id: projectId, capabilities: roles[identity]! } : null) } as ProjectsClient;
  const governance = new GovernanceService(pool!, projects, new AssessmentsService(pool!, projects));
  let pm = ''; let lead = ''; let dev = ''; let practice = ''; let client = '';
  const as = (userId: string, identity: string) => ({ userId, requestId: randomUUID(), identity });
  const project = () => id(
    `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on)
     VALUES($1, $2, $3, 'Gobernado', 'development', $4, $5, $5, '2026-01-01', '2026-12-31') RETURNING id`,
    [practice, client, `G-${randomUUID().slice(0, 8)}`, pm, lead]);
  const milestone = (projectId: string, dueOn: string, critical = false) => id(
    'INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical) VALUES($1, $2, $3, $4, $5) RETURNING id', [projectId, 'Entrega', dev, dueOn, critical]);

  beforeAll(async () => {
    [pm, lead, dev] = (await Promise.all(['pm', 'lead', 'dev'].map((n) =>
      id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [n, `${n}-${randomUUID()}@example.invalid`])))) as [string, string, string];
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`G${randomUUID().slice(0, 8)}`, 'Práctica']);
    client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
  });

  it('opens one event per condition with its automatic action, following the prototype rule', async () => {
    const p = await project();
    const m = await milestone(p, day(-4), true);
    await milestone(p, day(10));
    const events = await governance.events(as(pm, 'pm'), p);
    expect(() => healthEvent.strict().array().parse(events)).not.toThrow();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      ruleKey: 'milestone_overdue', severity: 'critical', title: 'Hito vencido: Entrega', episode: 1, target: { kind: 'milestone', id: m },
      resolvedAt: null, responseStatus: 'missing', response: null, canRespond: true, canValidate: false,
      // Owner of the milestone, two days, high priority.
      task: { owner: { id: dev }, dueOn: day(2), priority: 'high', status: 'pending', automatic: true, title: 'Atender el hito vencido: Entrega' },
    });
    // Asking again, even at the same time, changes nothing.
    await Promise.all([governance.events(as(pm, 'pm'), p), governance.events(as(lead, 'lead'), p), governance.tasks(as(dev, 'viewer'), p)]);
    expect((await owner!.query('SELECT count(*)::int AS n FROM phs.health_event WHERE project_id = $1', [p])).rows[0].n).toBe(1);
    expect((await owner!.query('SELECT count(*)::int AS n FROM phs.health_task WHERE project_id = $1', [p])).rows[0].n).toBe(1);
  });

  it('covers risks, renewals and pending changes, and respects the switch for automatic actions', async () => {
    const p = await project();
    await owner!.query(
      `INSERT INTO phs.risk(project_id, title, risk_type, category, probability, impact, owner_id, mitigation_due_on, status) VALUES
        ($1, 'Vencido', 'project', 'scope', 3, 3, $2, $3, 'open'), ($1, 'Materializado', 'project', 'scope', 1, 1, $2, $4, 'materialized'),
        ($1, 'Al día', 'project', 'scope', 1, 1, $2, $4, 'open')`, [p, dev, day(-2), day(30)]);
    await owner!.query('INSERT INTO phs.renewal(project_id, due_on, owner_id) VALUES($1, $2, $3), ($1, $4, $3)', [p, day(4), pm, day(200)]);
    await owner!.query(`INSERT INTO phs.project_change(project_id, title, description, change_type, proposed_by, requested_impact) VALUES($1, 'Ampliar', 'Motivo', 'client', $2, '{}')`, [p, pm]);
    const events = await governance.events(as(lead, 'lead'), p);
    expect(events.map((e) => [e.ruleKey, e.severity, e.responseStatus, e.task?.owner.id, e.task?.dueOn, e.task?.priority])).toEqual([
      ['risk_materialized', 'critical', 'not_required', dev, day(2), 'high'],
      ['risk_mitigation_overdue', 'critical', 'missing', dev, day(2), 'high'],
      // Ten days by rule, but never past the renewal date.
      ['renewal_due', 'warning', 'not_required', pm, day(4), 'medium'],
      ['change_pending', 'info', 'not_required', lead, day(7), 'medium'],
    ]);
    const quiet = await project();
    await milestone(quiet, day(-1));
    await owner!.query("INSERT INTO phs.review_policy(project_id, anchor_on, cadence, auto_tasks) VALUES($1, CURRENT_DATE, 'weekly', false)", [quiet]);
    const [alone] = await governance.events(as(pm, 'pm'), quiet);
    expect(alone).toMatchObject({ ruleKey: 'milestone_overdue', severity: 'warning', task: null, responseStatus: 'missing' });
  });

  it('a critical alert needs cause and plan from the PM and the validation of the lead', async () => {
    const p = await project();
    await milestone(p, day(-4), true);
    const [event] = await governance.events(as(pm, 'pm'), p);
    const plan = { cause: 'El proveedor no entregó su API.', kind: 'remediation' as const, plan: 'Construir un simulador esta semana.', changeId: null };
    await expect(governance.respond(as(dev, 'viewer'), event!.id, plan)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(governance.respond(as(dev, 'none'), event!.id, plan)).rejects.toMatchObject({ code: 'not_found' });
    await expect(governance.respond(as(pm, 'pm'), event!.id, { ...plan, kind: 'replan' })).rejects.toMatchObject({ code: 'change_required' });
    await expect(governance.respond(as(pm, 'pm'), event!.id, { ...plan, kind: 'replan', changeId: randomUUID() })).rejects.toMatchObject({ code: 'change_required' });

    const pending = await governance.respond(as(pm, 'pm'), event!.id, plan);
    expect(pending).toMatchObject({ responseStatus: 'pending', canRespond: false, response: { revisionNo: 1, cause: plan.cause, submittedBy: { id: pm }, validation: null } });
    await expect(governance.respond(as(pm, 'pm'), event!.id, plan)).rejects.toMatchObject({ code: 'response_already_submitted' });
    await expect(governance.validate(as(pm, 'pm'), pending.response!.id, { decision: 'validated', comment: 'Yo mismo' })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await governance.events(as(lead, 'lead'), p))[0]?.canValidate).toBe(true);

    const returned = await governance.validate(as(lead, 'lead'), pending.response!.id, { decision: 'returned', comment: 'Falta la fecha del simulador.' });
    expect(returned).toMatchObject({ responseStatus: 'returned', response: { validation: { decision: 'returned', validator: { id: lead }, comment: 'Falta la fecha del simulador.' } } });
    await expect(governance.validate(as(lead, 'lead'), pending.response!.id, { decision: 'validated', comment: 'Otra vez' })).rejects.toMatchObject({ code: 'already_decided' });

    // Replanning goes through an approved change: the response names the proposal.
    const change = await id(`INSERT INTO phs.project_change(project_id, title, description, change_type, proposed_by, requested_impact) VALUES($1, 'Replanificar', 'Motivo', 'technical', $2, '{}') RETURNING id`, [p, pm]);
    const second = await governance.respond(as(pm, 'pm'), event!.id, { cause: plan.cause, kind: 'replan', plan: 'Mover la entrega tres semanas.', changeId: change });
    expect(second.response).toMatchObject({ revisionNo: 2, kind: 'replan', changeId: change });
    const validated = await governance.validate(as(lead, 'lead'), second.response!.id, { decision: 'validated', comment: 'De acuerdo; se decide el cambio.' });
    expect(validated).toMatchObject({ responseStatus: 'validated', canRespond: false, canValidate: false });
    expect((await owner!.query('SELECT count(*)::int AS n FROM phs.event_response WHERE event_id = $1', [event!.id])).rows[0].n).toBe(2);
    // Events that do not need a response refuse one.
    const [, changeEvent] = await governance.events(as(pm, 'pm'), p);
    expect(changeEvent?.ruleKey).toBe('change_pending');
    await expect(governance.respond(as(pm, 'pm'), changeEvent!.id, plan)).rejects.toMatchObject({ code: 'response_not_expected' });
  });

  it('completing the action does not resolve the event; fixing the cause does, and a recurrence is a new episode', async () => {
    const p = await project();
    const m = await milestone(p, day(-4));
    const [event] = await governance.events(as(pm, 'pm'), p);
    const done = await governance.transitionTask(as(dev, 'viewer'), event!.task!.id, { expectedRevision: 1, to: 'completed', note: 'Se habló con el cliente.' });
    expect(done).toMatchObject({ status: 'completed', closureNote: 'Se habló con el cliente.', canUpdate: false });
    // The milestone is still overdue: the event stays open and no second action is created.
    const [still] = await governance.events(as(pm, 'pm'), p);
    expect(still).toMatchObject({ id: event!.id, resolvedAt: null, task: { status: 'completed' } });
    expect((await owner!.query('SELECT count(*)::int AS n FROM phs.health_task WHERE project_id = $1', [p])).rows[0].n).toBe(1);

    await owner!.query("UPDATE phs.milestone SET status = 'completed', completed_on = $2 WHERE id = $1", [m, day(0)]);
    const [resolved] = await governance.events(as(pm, 'pm'), p);
    expect(resolved).toMatchObject({ id: event!.id, resolutionNote: 'La condición que originó el evento dejó de cumplirse.', canRespond: false });
    expect(resolved?.resolvedAt).not.toBeNull();

    await owner!.query("UPDATE phs.milestone SET status = 'pending', completed_on = NULL WHERE id = $1", [m]);
    const again = await governance.events(as(pm, 'pm'), p);
    expect(again.map((e) => [e.episode, e.resolvedAt === null])).toEqual([[2, true], [1, false]]);
    expect(again[0]?.task).toMatchObject({ status: 'pending', automatic: true });
  });

  it('closes the automatic action by itself, saying so, when the cause disappears', async () => {
    const p = await project();
    const m = await milestone(p, day(-4));
    const [event] = await governance.events(as(pm, 'pm'), p);
    await owner!.query("UPDATE phs.milestone SET status = 'completed', completed_on = $2 WHERE id = $1", [m, day(0)]);
    const tasks = await governance.tasks(as(pm, 'pm'), p);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: event!.task!.id, status: 'completed', closureNote: 'Cerrada por el sistema: la condición que la originó dejó de cumplirse.' });
    const activity = await owner!.query('SELECT source, actor_id FROM phs.activity WHERE task_id = $1', [event!.task!.id]);
    expect(activity.rows).toEqual([{ source: 'system', actor_id: null }]);
  });

  it('manual actions: creation, transitions with comment, inbox and permissions', async () => {
    const p = await project();
    const key = randomUUID();
    const input = { title: 'Reunión con el cliente', description: 'Revisar el alcance', ownerId: dev, dueOn: day(-1), priority: 'medium' as const, eventId: null };
    const created = await governance.createTask(as(pm, 'pm'), p, input, key);
    expect(() => taskSchema.strict().parse(created)).not.toThrow();
    expect(created).toMatchObject({ automatic: false, status: 'pending', overdue: true, owner: { id: dev }, projectName: 'Gobernado', revision: 1 });
    expect((await governance.createTask(as(pm, 'pm'), p, input, key)).id).toBe(created.id);
    await expect(governance.createTask(as(dev, 'viewer'), p, input, randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(governance.createTask(as(pm, 'pm'), p, { ...input, ownerId: randomUUID() }, randomUUID())).rejects.toMatchObject({ code: 'responsible_not_enabled' });
    await expect(governance.createTask(as(pm, 'pm'), p, { ...input, eventId: randomUUID() }, randomUUID())).rejects.toMatchObject({ code: 'not_found' });

    expect((await governance.mine(dev)).map((t) => t.id)).toContain(created.id);
    expect((await governance.mine(lead)).map((t) => t.id)).not.toContain(created.id);
    // The owner updates its action; someone who only views the project does not.
    await expect(governance.transitionTask(as(lead, 'viewer'), created.id, { expectedRevision: 1, to: 'in_progress' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(governance.transitionTask(as(lead, 'none'), created.id, { expectedRevision: 1, to: 'in_progress' })).rejects.toMatchObject({ code: 'not_found' });
    const started = await governance.transitionTask(as(dev, 'viewer'), created.id, { expectedRevision: 1, to: 'in_progress' });
    await expect(governance.transitionTask(as(dev, 'viewer'), created.id, { expectedRevision: 1, to: 'blocked' })).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: 2 });
    await expect(governance.transitionTask(as(dev, 'viewer'), created.id, { expectedRevision: started.revision, to: 'completed' })).rejects.toMatchObject({ code: 'note_required' });
    const closed = await governance.transitionTask(as(pm, 'pm'), created.id, { expectedRevision: started.revision, to: 'cancelled', note: 'El cliente canceló la reunión.' });
    expect(closed).toMatchObject({ status: 'cancelled', overdue: false, closureNote: 'El cliente canceló la reunión.' });
    await expect(governance.transitionTask(as(pm, 'pm'), created.id, { expectedRevision: closed.revision, to: 'pending' })).rejects.toMatchObject({ code: 'invalid_transition' });
    expect((await governance.mine(dev)).map((t) => t.id)).not.toContain(created.id);
    expect((await owner!.query('SELECT count(*)::int AS n FROM phs.activity WHERE task_id = $1', [created.id])).rows[0].n).toBe(3);
    await expect(governance.events(as(pm, 'none'), p)).rejects.toMatchObject({ code: 'not_found' });
  });
});
