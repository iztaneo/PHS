import { randomUUID } from 'node:crypto';
import { change as changeSchema } from '@phs/contracts';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaselinesService } from '../src/baselines.service.js';
import { ChangesService, type CreateChange } from '../src/changes.service.js';
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
const count = async (sql: string, params: unknown[]) => Number((await owner!.query(sql, params)).rows[0].n);
// The calendar day in the projects' time zone, not in UTC: after 18:00 in Mexico they differ.
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
const day = (offset: number) => localDate.format(new Date(Date.now() + offset * 86_400_000));

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('changes and baseline versions (PHS-018, PHS-019)', () => {
  const projects = new ProjectsService(pool!);
  const team = new TeamService(pool!, projects);
  const milestones = new MilestonesService(pool!, projects);
  const baselines = new BaselinesService(pool!, projects);
  const changes = new ChangesService(pool!, projects);
  let practice = ''; let pm = ''; let lead = ''; let lead2 = ''; let director = ''; let viewer = ''; let outsider = '';
  const actor = (userId: string) => ({ userId, requestId: randomUUID() });
  const revision = async (projectId: string) => (await projects.get(lead, projectId))!.revision;

  // Three committed milestones and a baseline with budget 100,000 and 1,000 hours.
  const setup = async () => {
    const project = (await projects.create(actor(pm), {
      practiceId: practice, code: `X-${randomUUID().slice(0, 8)}`, name: 'Proyecto', description: '', clientName: `Cliente ${randomUUID().slice(0, 8)}`,
      serviceTypeCode: 'development', pmId: pm, leadId: lead, technicalOwnerId: lead, sponsorId: null, clientContact: '', escalationNotes: '',
      startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'MXN',
    }, randomUUID())).project;
    const made = [];
    for (const [title, offset] of [['Uno', 20], ['Dos', 40], ['Tres', 60]] as const) {
      made.push(await milestones.create(actor(pm), project.id, { title, deliverable: '', ownerId: pm, dueOn: day(offset), critical: false }, randomUUID()));
    }
    await baselines.publishInitial(actor(pm), project.id, { expectedRevision: await revision(project.id), scope: 'Alcance v1', budget: '100000', effortHours: '1000', reason: 'Inicial' }, randomUUID());
    return { id: project.id, m: made.map((x) => x.id) as [string, string, string] };
  };
  const proposal = (overrides: Partial<CreateChange> = {}): CreateChange => ({
    title: 'Ampliar plazo', description: 'El cliente pidió una funcionalidad adicional.', changeType: 'client', correctsId: null,
    impact: { milestones: [] }, ...overrides,
  });

  beforeAll(async () => {
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`X${randomUUID().slice(0, 8)}`, 'Práctica']);
    [pm, lead, lead2, director, viewer, outsider] = (await Promise.all(
      ['pm', 'lead', 'lead2', 'director', 'viewer', 'outsider'].map(user))) as [string, string, string, string, string, string];
    for (const [who, role] of [[pm, 'pm'], [lead, 'lead'], [lead2, 'lead'], [director, 'director']] as const) {
      await owner!.query('INSERT INTO phs.practice_membership(practice_id, user_id, role) VALUES($1, $2, $3)', [practice, who, role]);
    }
  });

  it('a proposal records before and proposed values and changes nothing else', async () => {
    const p = await setup();
    const before = await revision(p.id);
    const created = await changes.propose(actor(pm), p.id, proposal({
      impact: { endsOn: '2027-01-31', budgetDelta: '25000.50', effortHoursDelta: '-100', scope: 'Alcance v2', milestones: [{ id: p.m[1], dueOn: day(55) }] },
    }), randomUUID());
    expect(() => changeSchema.strict().parse(created)).not.toThrow();
    expect(created).toMatchObject({
      decision: null, canDecide: false, financialsHidden: false, proposedBy: { id: pm },
      impact: {
        baselineVersion: 1, endsOn: { before: '2026-12-31', proposed: '2027-01-31' },
        budget: { before: '100000.00', delta: '25000.50', proposed: '125000.50' },
        effortHours: { before: '1000.00', delta: '-100', proposed: '900.00' },
        scope: { before: 'Alcance v1', proposed: 'Alcance v2' },
        milestones: [{ id: p.m[1], title: 'Dos', before: day(40), proposed: day(55) }],
      },
    });
    // Nothing moved: same baseline, same dates, same revision.
    expect(await revision(p.id)).toBe(before);
    expect((await baselines.list(pm, p.id)).map((b) => b.version)).toEqual([1]);
    expect((await milestones.list(pm, p.id)).find((m) => m.id === p.m[1])?.dueOn).toBe(day(40));
    expect((await changes.list(lead, p.id))[0]?.canDecide).toBe(true);
    await expect(owner!.query('UPDATE phs.project_change SET title = $2 WHERE id = $1', [created.id, 'Otro'])).rejects.toMatchObject({ code: '55000' });
  });

  it('rejects proposals that cannot be applied or come from someone who may not propose', async () => {
    const p = await setup();
    const bad: [string, CreateChange['impact']][] = [
      ['invalid_impact', { milestones: [] }],
      ['invalid_impact', { milestones: [{ id: randomUUID(), dueOn: day(10) }] }],
      ['invalid_impact', { milestones: [{ id: p.m[0], dueOn: day(10) }, { id: p.m[0], dueOn: day(11) }] }],
      ['invalid_impact', { endsOn: '2025-06-01', milestones: [] }],
      ['invalid_impact', { budgetDelta: '-100000.01', milestones: [] }],
    ];
    for (const [code, impact] of bad) await expect(changes.propose(actor(pm), p.id, proposal({ impact }), randomUUID()), JSON.stringify(impact)).rejects.toMatchObject({ code });
    // A milestone added after the baseline, or already completed, is not a commitment that can be moved.
    const later = await milestones.create(actor(pm), p.id, { title: 'Posterior', deliverable: '', ownerId: pm, dueOn: day(80), critical: false }, randomUUID());
    await expect(changes.propose(actor(pm), p.id, proposal({ impact: { milestones: [{ id: later.id, dueOn: day(90) }] } }), randomUUID())).rejects.toMatchObject({ code: 'invalid_impact' });
    await milestones.transition(actor(pm), p.id, p.m[0], { expectedRevision: 1, to: 'completed', note: 'Listo' });
    await expect(changes.propose(actor(pm), p.id, proposal({ impact: { milestones: [{ id: p.m[0], dueOn: day(30) }] } }), randomUUID())).rejects.toMatchObject({ code: 'invalid_impact' });
    const ok = { scope: 'Otro alcance', milestones: [] };
    await expect(changes.propose(actor(lead), p.id, proposal({ impact: ok }), randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(changes.propose(actor(director), p.id, proposal({ impact: ok }), randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(changes.propose(actor(outsider), p.id, proposal({ impact: ok }), randomUUID())).rejects.toMatchObject({ code: 'not_found' });
    await expect(changes.propose(actor(pm), p.id, proposal({ impact: ok, correctsId: randomUUID() }), randomUUID())).rejects.toMatchObject({ code: 'not_found' });
    expect(await count('SELECT count(*) AS n FROM phs.project_change WHERE project_id = $1', [p.id])).toBe(0);
    const noBaseline = (await projects.create(actor(pm), {
      practiceId: practice, code: `X-${randomUUID().slice(0, 8)}`, name: 'Sin base', description: '', clientName: 'Cliente', serviceTypeCode: 'development',
      pmId: pm, leadId: lead, technicalOwnerId: lead, sponsorId: null, clientContact: '', escalationNotes: '', startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'MXN',
    }, randomUUID())).project;
    await expect(changes.propose(actor(pm), noBaseline.id, proposal({ impact: ok }), randomUUID())).rejects.toMatchObject({ code: 'baseline_required' });
  });

  it('approving creates the next baseline, moves only the listed milestone and keeps the previous version intact', async () => {
    const p = await setup();
    // The middle milestone was rescheduled operationally before the change was approved.
    await milestones.update(actor(pm), p.id, p.m[1], { expectedRevision: 1, dueOn: day(50), reason: 'Atraso del proveedor' });
    const created = await changes.propose(actor(pm), p.id, proposal({ impact: { budgetDelta: '20000', endsOn: '2027-02-28', milestones: [{ id: p.m[1], dueOn: day(55) }] } }), randomUUID());
    const before = await revision(p.id);
    const by = actor(lead);
    const key = randomUUID();
    const decided = await changes.decide(by, p.id, created.id, { decision: 'approved', comment: 'Aprobado por el comité' }, key);
    expect(decided.decision).toMatchObject({ decision: 'approved', decidedBy: { id: lead }, comment: 'Aprobado por el comité', baselineVersion: 2 });
    expect(decided.canDecide).toBe(false);

    const [v2, v1] = await baselines.list(lead, p.id);
    expect(v2).toMatchObject({ version: 2, current: true, endsOn: '2027-02-28', budget: '120000.00', effortHours: '1000.00', scope: 'Alcance v1', reason: 'Cambio aprobado: Ampliar plazo' });
    expect(v1).toMatchObject({ version: 1, current: false, endsOn: '2026-12-31', budget: '100000.00' });
    const dates = (b: typeof v2) => (b!.milestones as { id: string; due_on: string }[]).map((m) => m.due_on);
    expect(dates(v1)).toEqual([day(20), day(40), day(60)]);
    expect(dates(v2)).toEqual([day(20), day(55), day(60)]);

    const live = await milestones.list(lead, p.id);
    expect(live.map((m) => [m.dueOn, m.committedDueOn, m.status])).toEqual([
      [day(20), day(20), 'pending'], [day(55), day(55), 'pending'], [day(60), day(60), 'pending'],
    ]);
    expect((await projects.get(lead, p.id))).toMatchObject({ endsOn: '2027-02-28', revision: before + 1 });
    const audit = await owner!.query('SELECT action FROM phs.audit_entry WHERE request_id = $1', [by.requestId]);
    expect(audit.rows.map((r) => r.action)).toEqual(['change.approved']);
    expect(await count('SELECT count(*) AS n FROM phs.activity WHERE milestone_id = $1 AND note LIKE $2', [p.m[1], 'Fecha comprometida cambiada%'])).toBe(1);

    // A retry returns the same decision; a second decision is refused; the delta was applied once.
    expect((await changes.decide(actor(lead), p.id, created.id, { decision: 'approved', comment: 'Aprobado por el comité' }, key)).decision?.baselineVersion).toBe(2);
    await expect(changes.decide(actor(lead2), p.id, created.id, { decision: 'approved', comment: 'También apruebo' }, randomUUID())).rejects.toMatchObject({ code: 'already_decided' });
    await expect(changes.decide(actor(lead2), p.id, created.id, { decision: 'rejected', comment: 'No' }, randomUUID())).rejects.toMatchObject({ code: 'already_decided' });
    expect((await baselines.list(lead, p.id)).map((b) => [b.version, b.budget])).toEqual([[2, '120000.00'], [1, '100000.00']]);
  });

  it('two approvers at the same time produce one decision and one new baseline', async () => {
    const p = await setup();
    const created = await changes.propose(actor(pm), p.id, proposal({ impact: { budgetDelta: '5000', milestones: [] } }), randomUUID());
    const results = await Promise.allSettled([
      changes.decide(actor(lead), p.id, created.id, { decision: 'approved', comment: 'Sí' }, randomUUID()),
      changes.decide(actor(lead2), p.id, created.id, { decision: 'approved', comment: 'Sí también' }, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'already_decided' });
    expect((await baselines.list(lead, p.id)).map((b) => [b.version, b.budget])).toEqual([[2, '105000.00'], [1, '100000.00']]);
  });

  it('rejecting needs a comment holder with permission and leaves baseline and commitments untouched', async () => {
    const p = await setup();
    const created = await changes.propose(actor(pm), p.id, proposal({ impact: { milestones: [{ id: p.m[2], dueOn: day(90) }] } }), randomUUID());
    for (const who of [pm, director]) {
      await expect(changes.decide(actor(who), p.id, created.id, { decision: 'rejected', comment: 'No' }, randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    }
    await expect(changes.decide(actor(outsider), p.id, created.id, { decision: 'rejected', comment: 'No' }, randomUUID())).rejects.toMatchObject({ code: 'not_found' });
    await expect(changes.decide(actor(lead), p.id, randomUUID(), { decision: 'rejected', comment: 'No' }, randomUUID())).rejects.toMatchObject({ code: 'not_found' });
    const rejected = await changes.decide(actor(lead), p.id, created.id, { decision: 'rejected', comment: 'No hay presupuesto' }, randomUUID());
    expect(rejected.decision).toMatchObject({ decision: 'rejected', comment: 'No hay presupuesto', baselineVersion: null });
    expect((await baselines.list(lead, p.id)).map((b) => b.version)).toEqual([1]);
    expect((await milestones.list(lead, p.id)).find((m) => m.id === p.m[2])).toMatchObject({ dueOn: day(60), committedDueOn: day(60) });
    // A correction is a new proposal that points to the rejected one.
    const corrected = await changes.propose(actor(pm), p.id, proposal({ title: 'Ampliar plazo, corregido', correctsId: created.id, impact: { milestones: [{ id: p.m[2], dueOn: day(75) }] } }), randomUUID());
    expect(corrected.impact.correctsId).toBe(created.id);
  });

  it('a proposal written against an older baseline cannot be approved without review', async () => {
    const p = await setup();
    const first = await changes.propose(actor(pm), p.id, proposal({ title: 'Primero', impact: { budgetDelta: '10000', milestones: [] } }), randomUUID());
    const second = await changes.propose(actor(pm), p.id, proposal({ title: 'Segundo', impact: { budgetDelta: '10000', milestones: [] } }), randomUUID());
    await changes.decide(actor(lead), p.id, first.id, { decision: 'approved', comment: 'Sí' }, randomUUID());
    const rev = await revision(p.id);
    await expect(changes.decide(actor(lead), p.id, second.id, { decision: 'approved', comment: 'Sí' }, randomUUID())).rejects.toMatchObject({ code: 'baseline_changed' });
    // The failed approval left no decision and no baseline behind.
    expect((await changes.list(lead, p.id)).find((c) => c.id === second.id)?.decision).toBeNull();
    expect((await baselines.list(lead, p.id)).map((b) => [b.version, b.budget])).toEqual([[2, '110000.00'], [1, '100000.00']]);
    expect(await revision(p.id)).toBe(rev);
    expect((await changes.decide(actor(lead), p.id, second.id, { decision: 'rejected', comment: 'Rehacer sobre la versión 2' }, randomUUID())).decision?.decision).toBe('rejected');
  });

  it('hides the amounts of a change from users who may not see financials', async () => {
    const p = await setup();
    await team.put(actor(pm), p.id, viewer, { role: 'viewer', allocationPct: null });
    await changes.propose(actor(pm), p.id, proposal({ impact: { budgetDelta: '5000', scope: 'Más alcance', milestones: [] } }), randomUUID());
    const [seen] = await changes.list(viewer, p.id);
    expect(seen).toMatchObject({ financialsHidden: true, canDecide: false, impact: { scope: { proposed: 'Más alcance' } } });
    expect(seen?.impact.budget).toBeUndefined();
    expect((await changes.list(director, p.id))[0]?.impact.budget?.delta).toBe('5000');
    await expect(changes.list(outsider, p.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});
