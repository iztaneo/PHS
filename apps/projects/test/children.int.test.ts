import { randomUUID } from 'node:crypto';
import { baseline as baselineSchema, milestone as milestoneSchema, projectMember } from '@phs/contracts';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaselinesService } from '../src/baselines.service.js';
import { MilestonesService } from '../src/milestones.service.js';
import { ProjectsService } from '../src/projects.service.js';
import { TeamService } from '../src/team.service.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.PROJECTS_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;

const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const user = (name: string) =>
  id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [name, `${name}-${randomUUID()}@example.invalid`]);
const value = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0];
// The calendar day in the projects' time zone, not in UTC: after 18:00 in Mexico they differ.
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
const day = (offset: number) => localDate.format(new Date(Date.now() + offset * 86_400_000));

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('team, milestones and initial baseline (PHS-010, PHS-015, PHS-011)', () => {
  const projects = new ProjectsService(pool!);
  const team = new TeamService(pool!, projects);
  const milestones = new MilestonesService(pool!, projects);
  const baselines = new BaselinesService(pool!, projects);
  let practice = ''; let pm = ''; let lead = ''; let director = ''; let dev = ''; let viewer = ''; let disabled = ''; let outsider = '';
  const actor = (userId: string) => ({ userId, requestId: randomUUID() });
  const newProject = async () => (await projects.create(actor(pm), {
    practiceId: practice, code: `K-${randomUUID().slice(0, 8)}`, name: 'Proyecto', description: '', clientName: `Cliente ${randomUUID().slice(0, 8)}`,
    serviceTypeCode: 'development', pmId: pm, leadId: lead, technicalOwnerId: lead, sponsorId: null, clientContact: 'Ana Pérez',
    escalationNotes: 'Escalar al director de TI', startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'MXN',
  }, randomUUID())).project;
  const newMilestone = (projectId: string, overrides = {}) => milestones.create(actor(pm), projectId,
    { title: 'Entrega', deliverable: 'Versión aceptada', ownerId: dev, dueOn: day(30), critical: true, ...overrides }, randomUUID());
  const revision = async (projectId: string) => (await projects.get(pm, projectId))!.revision;

  beforeAll(async () => {
    practice = await id('INSERT INTO phs.practice(code, name, timezone) VALUES($1, $2, $3) RETURNING id', [`K${randomUUID().slice(0, 8)}`, 'Práctica', 'America/Mexico_City']);
    [pm, lead, director, dev, viewer, disabled, outsider] = (await Promise.all(
      ['pm', 'lead', 'director', 'dev', 'viewer', 'disabled', 'outsider'].map(user))) as [string, string, string, string, string, string, string];
    for (const [who, role] of [[pm, 'pm'], [lead, 'lead'], [director, 'director']] as const) {
      await owner!.query('INSERT INTO phs.practice_membership(practice_id, user_id, role) VALUES($1, $2, $3)', [practice, who, role]);
    }
    await owner!.query('UPDATE phs.app_user SET active = false WHERE id = $1', [disabled]);
  });

  it('keeps the project contact separate from the general client data', async () => {
    const project = await newProject();
    expect(project).toMatchObject({ clientContact: 'Ana Pérez', escalationNotes: 'Escalar al director de TI' });
    const updated = await projects.update(actor(pm), project.id, { expectedRevision: 1, clientContact: 'Luis Gómez' });
    expect(updated.clientContact).toBe('Luis Gómez');
    expect((await value('SELECT primary_contact FROM phs.client WHERE id = $1', [project.clientId])).primary_contact).toBeNull();
  });

  it('adds a member once, updates it, and moves the project revision', async () => {
    const project = await newProject();
    const added = await team.put(actor(pm), project.id, dev, { role: 'contributor', allocationPct: 50 });
    expect(() => projectMember.strict().array().parse(added)).not.toThrow();
    expect(added).toMatchObject([{ userId: dev, role: 'contributor', allocationPct: 50 }]);
    expect(await revision(project.id)).toBe(2);
    await team.put(actor(pm), project.id, dev, { role: 'contributor', allocationPct: 50 });
    expect(await revision(project.id)).toBe(2);
    const changed = await team.put(actor(lead), project.id, dev, { role: 'viewer', allocationPct: null });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ role: 'viewer', allocationPct: null });
    expect(await revision(project.id)).toBe(3);
    await expect(team.put(actor(pm), project.id, disabled, { role: 'viewer', allocationPct: null })).rejects.toMatchObject({ code: 'responsible_not_enabled' });
    await expect(team.put(actor(director), project.id, viewer, { role: 'viewer', allocationPct: null })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(team.put(actor(outsider), project.id, viewer, { role: 'viewer', allocationPct: null })).rejects.toMatchObject({ code: 'not_found' });
    // A member consults the project but cannot change the team.
    expect((await team.list(dev, project.id))).toHaveLength(1);
    await expect(team.put(actor(dev), project.id, viewer, { role: 'viewer', allocationPct: null })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('warns before removing a member with open responsibilities', async () => {
    const project = await newProject();
    await team.put(actor(pm), project.id, dev, { role: 'contributor', allocationPct: 100 });
    await team.put(actor(pm), project.id, viewer, { role: 'viewer', allocationPct: null });
    await newMilestone(project.id);
    await expect(team.remove(actor(pm), project.id, dev, false)).rejects.toMatchObject({
      code: 'member_has_responsibilities',
      details: { responsibilities: { milestones: 1, risks: 0, renewals: 0, tasks: 0 } },
    });
    expect(await team.list(pm, project.id)).toHaveLength(2);
    expect((await team.remove(actor(pm), project.id, viewer, false)).map((m) => m.userId)).toEqual([dev]);
    expect(await team.remove(actor(pm), project.id, dev, true)).toEqual([]);
    // Still the owner of an open milestone: read access is kept through it.
    expect((await projects.get(dev, project.id))?.capabilities).toMatchObject({ view: true, editOperation: false, seeFinancials: false });
    await expect(team.remove(actor(pm), project.id, dev, false)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('registers a milestone with timeline, audit, outbox and revisions', async () => {
    const project = await newProject();
    const by = actor(pm);
    const key = randomUUID();
    const input = { title: 'Entrega 1', deliverable: 'Acta firmada', ownerId: dev, dueOn: day(10), critical: true };
    const created = await milestones.create(by, project.id, input, key);
    expect(() => milestoneSchema.strict().parse(created)).not.toThrow();
    expect(created).toMatchObject({ ...{ title: 'Entrega 1', deliverable: 'Acta firmada', dueOn: day(10), critical: true },
      owner: { id: dev }, status: 'pending', committedDueOn: null, overdue: false, revision: 1, canUpdate: true });
    expect(await revision(project.id)).toBe(2);
    expect((await milestones.create(actor(pm), project.id, input, key)).id).toBe(created.id);
    expect(await milestones.list(pm, project.id)).toHaveLength(1);
    expect((await value('SELECT count(*)::int AS n FROM phs.activity WHERE milestone_id = $1', [created.id])).n).toBe(1);
    expect((await value('SELECT action FROM phs.audit_entry WHERE request_id = $1', [by.requestId])).action).toBe('milestone.created');
    expect((await value('SELECT count(*)::int AS n FROM phs.outbox_message WHERE deduplication_key = $1', [`milestone.created:${created.id}:1`])).n).toBe(1);
    await expect(milestones.create(actor(pm), project.id, { ...input, ownerId: disabled }, randomUUID())).rejects.toMatchObject({ code: 'responsible_not_enabled' });
    await expect(milestones.create(actor(director), project.id, input, randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(milestones.create(actor(outsider), project.id, input, randomUUID())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('shows an open milestone past its date as overdue, and a completed one as not open', async () => {
    const project = await newProject();
    const late = await newMilestone(project.id, { title: 'Atrasado', dueOn: day(-3) });
    const today = await newMilestone(project.id, { title: 'Hoy', dueOn: (await value("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS d", [])).d });
    expect(late.overdue).toBe(true);
    expect(today.overdue).toBe(false);
    await expect(milestones.transition(actor(pm), project.id, late.id, { expectedRevision: 1, to: 'completed' })).rejects.toMatchObject({ code: 'note_required' });
    await expect(milestones.transition(actor(pm), project.id, late.id, { expectedRevision: 1, to: 'completed', note: 'Listo', completedOn: day(5) }))
      .rejects.toMatchObject({ code: 'invalid_completion_date' });
    const done = await milestones.transition(actor(pm), project.id, late.id, { expectedRevision: 1, to: 'completed', note: 'Entregado con acta', completedOn: day(-1) });
    expect(done).toMatchObject({ status: 'completed', completedOn: day(-1), completionNote: 'Entregado con acta', overdue: false, revision: 2 });
    const activity = await owner!.query('SELECT note FROM phs.activity WHERE milestone_id = $1 ORDER BY occurred_at', [late.id]);
    expect(activity.rows.map((r) => r.note)).toEqual(['Hito registrado', 'Cumplido: Entregado con acta']);
  });

  it('follows the allowed transitions and lets the owner update its own milestone', async () => {
    const project = await newProject();
    const m = await newMilestone(project.id);
    // The owner is not PM, lead or member: the milestone alone gives access to it.
    expect((await milestones.list(dev, project.id))[0]?.canUpdate).toBe(true);
    const started = await milestones.transition(actor(dev), project.id, m.id, { expectedRevision: 1, to: 'in_progress' });
    expect(started.status).toBe('in_progress');
    await expect(milestones.transition(actor(dev), project.id, m.id, { expectedRevision: 1, to: 'completed', note: 'x' })).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: 2 });
    await expect(milestones.transition(actor(dev), project.id, m.id, { expectedRevision: 2, to: 'pending' })).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(milestones.update(actor(dev), project.id, m.id, { expectedRevision: 2, title: 'Otro' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(milestones.transition(actor(director), project.id, m.id, { expectedRevision: 2, to: 'completed', note: 'x' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(milestones.transition(actor(outsider), project.id, m.id, { expectedRevision: 2, to: 'completed', note: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    const cancelled = await milestones.transition(actor(pm), project.id, m.id, { expectedRevision: 2, to: 'cancelled', note: 'Fuera de alcance' });
    await expect(milestones.update(actor(pm), project.id, m.id, { expectedRevision: cancelled.revision, title: 'Cerrado' })).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(milestones.transition(actor(pm), project.id, m.id, { expectedRevision: cancelled.revision, to: 'pending' })).rejects.toMatchObject({ code: 'note_required' });
    const reopened = await milestones.transition(actor(pm), project.id, m.id, { expectedRevision: cancelled.revision, to: 'pending', note: 'Vuelve al alcance' });
    expect(reopened).toMatchObject({ status: 'pending', completedOn: null });
    expect((await value('SELECT count(*)::int AS n FROM phs.activity WHERE milestone_id = $1', [m.id])).n).toBe(4);
  });

  it('publishes the initial baseline once, complete and immutable', async () => {
    const project = await newProject();
    await team.put(actor(pm), project.id, dev, { role: 'contributor', allocationPct: 80 });
    const kept = await newMilestone(project.id, { title: 'Comprometido', dueOn: day(20) });
    const dropped = await newMilestone(project.id, { title: 'Cancelado' });
    await milestones.transition(actor(pm), project.id, dropped.id, { expectedRevision: 1, to: 'cancelled', note: 'No aplica' });
    const current = await revision(project.id);
    const body = { expectedRevision: current, scope: 'Alcance acordado', budget: '150000.50', effortHours: null, reason: 'Línea base inicial' };

    await expect(baselines.publishInitial(actor(pm), project.id, { ...body, expectedRevision: current - 1 }, randomUUID())).rejects.toMatchObject({ code: 'revision_conflict' });
    await expect(baselines.publishInitial(actor(director), project.id, body, randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    const key = randomUUID();
    const published = await baselines.publishInitial(actor(pm), project.id, body, key);
    expect(() => baselineSchema.strict().parse(published)).not.toThrow();
    expect(published).toMatchObject({
      version: 1, current: true, startsOn: '2026-01-01', endsOn: '2026-12-31', scope: 'Alcance acordado',
      budget: '150000.50', effortHours: null, financialsHidden: false, currency: 'MXN', createdBy: { id: pm },
      milestones: [{ id: kept.id, title: 'Comprometido', due_on: day(20), owner_id: dev, critical: true, weight: 1 }],
    });
    expect(published.team).toEqual([
      expect.objectContaining({ user_id: pm, role: 'pm' }), expect.objectContaining({ user_id: lead, role: 'lead' }),
      expect.objectContaining({ user_id: lead, role: 'technical_owner' }),
      expect.objectContaining({ user_id: dev, role: 'contributor', allocation_pct: 80 }),
    ]);
    const after = await projects.get(pm, project.id);
    expect(after).toMatchObject({ hasBaseline: true, revision: current + 1 });

    // A retry returns the same baseline; a second publication is rejected.
    expect((await baselines.publishInitial(actor(pm), project.id, body, key)).id).toBe(published.id);
    await expect(baselines.publishInitial(actor(pm), project.id, { ...body, expectedRevision: current + 1 }, randomUUID())).rejects.toMatchObject({ code: 'baseline_exists' });
    expect((await value('SELECT count(*)::int AS n FROM phs.baseline WHERE project_id = $1', [project.id])).n).toBe(1);

    // Later operational changes do not touch the approved snapshot.
    const committed = (await milestones.list(pm, project.id)).find((m) => m.id === kept.id)!;
    expect(committed.committedDueOn).toBe(day(20));
    await expect(milestones.update(actor(pm), project.id, kept.id, { expectedRevision: committed.revision, dueOn: day(40) })).rejects.toMatchObject({ code: 'reason_required' });
    const moved = await milestones.update(actor(pm), project.id, kept.id, { expectedRevision: committed.revision, dueOn: day(40), title: 'Renombrado', reason: 'El cliente pidió más tiempo' });
    expect(moved).toMatchObject({ status: 'rescheduled', dueOn: day(40), committedDueOn: day(20), title: 'Renombrado' });
    await team.remove(actor(pm), project.id, dev, true);
    const [stored] = await baselines.list(pm, project.id);
    expect(stored?.milestones).toEqual(published.milestones);
    expect(stored?.team).toEqual(published.team);
    await expect(owner!.query('UPDATE phs.baseline SET scope = $2 WHERE id = $1', [published.id, 'Otro'])).rejects.toMatchObject({ code: '55000' });
    // A milestone added after the baseline is operational, not committed.
    expect((await newMilestone(project.id, { title: 'Posterior' })).committedDueOn).toBeNull();
    // Project dates are now commitments too.
    await expect(projects.update(actor(pm), project.id, { expectedRevision: await revision(project.id), endsOn: '2027-06-30' })).rejects.toMatchObject({ code: 'baseline_change_required' });
  });

  it('keeps an unknown budget as unknown and hides amounts from those who may not see them', async () => {
    const project = await newProject();
    await team.put(actor(pm), project.id, viewer, { role: 'viewer', allocationPct: null });
    const published = await baselines.publishInitial(actor(lead), project.id,
      { expectedRevision: await revision(project.id), scope: 'Alcance', budget: null, effortHours: '1200', reason: 'Inicial' }, randomUUID());
    expect(published).toMatchObject({ budget: null, effortHours: '1200.00', financialsHidden: false, milestones: [] });
    expect((await value('SELECT budget FROM phs.baseline WHERE id = $1', [published.id])).budget).toBeNull();
    expect((await baselines.list(director, project.id))[0]).toMatchObject({ effortHours: '1200.00', financialsHidden: false });
    expect((await baselines.list(viewer, project.id))[0]).toMatchObject({ budget: null, effortHours: null, financialsHidden: true, scope: 'Alcance' });
    await expect(baselines.list(outsider, project.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});
