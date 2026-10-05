import { randomUUID } from 'node:crypto';
import { financeSummary, financialObservation, risk as riskSchema, riskHistoryEntry } from '@phs/contracts';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaselinesService } from '../src/baselines.service.js';
import { FinanceService } from '../src/finance.service.js';
import { MilestonesService } from '../src/milestones.service.js';
import { ProjectsService } from '../src/projects.service.js';
import { RisksService, type CreateRisk } from '../src/risks.service.js';
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

describe.skipIf(!ready)('economy and risks (PHS-012, PHS-016)', () => {
  const projects = new ProjectsService(pool!);
  const team = new TeamService(pool!, projects);
  const milestones = new MilestonesService(pool!, projects);
  const baselines = new BaselinesService(pool!, projects);
  const finance = new FinanceService(pool!, projects);
  const risks = new RisksService(pool!, projects);
  let practice = ''; let pm = ''; let lead = ''; let director = ''; let dev = ''; let viewer = ''; let disabled = ''; let outsider = '';
  const actor = (userId: string) => ({ userId, requestId: randomUUID() });
  const revision = async (projectId: string) => (await projects.get(pm, projectId))!.revision;
  const newProject = async () => (await projects.create(actor(pm), {
    practiceId: practice, code: `F-${randomUUID().slice(0, 8)}`, name: 'Proyecto', description: '', clientName: `Cliente ${randomUUID().slice(0, 8)}`,
    serviceTypeCode: 'development', pmId: pm, leadId: lead, technicalOwnerId: lead, sponsorId: null, clientContact: '',
    escalationNotes: '', startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'USD',
  }, randomUUID())).project;
  // Two milestones of equal weight: one completed, one pending. Actual progress: 50%.
  const withBaseline = async (budget: string | null) => {
    const project = await newProject();
    const done = await milestones.create(actor(pm), project.id, { title: 'Uno', deliverable: '', ownerId: dev, dueOn: day(-10), critical: false }, randomUUID());
    await milestones.create(actor(pm), project.id, { title: 'Dos', deliverable: '', ownerId: dev, dueOn: day(30), critical: false }, randomUUID());
    await baselines.publishInitial(actor(pm), project.id, { expectedRevision: await revision(project.id), scope: 'Alcance', budget, effortHours: '1000', reason: 'Inicial' }, randomUUID());
    await milestones.transition(actor(pm), project.id, done.id, { expectedRevision: 1, to: 'completed', note: 'Entregado' });
    return project;
  };
  const observe = (projectId: string, overrides = {}, by = pm) => finance.record(actor(by), projectId,
    { effectiveOn: day(-1), totalCost: '54000', totalEffortHours: null, source: 'Reporte de costos', supersedesId: null, ...overrides }, randomUUID());

  beforeAll(async () => {
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`F${randomUUID().slice(0, 8)}`, 'Práctica']);
    [pm, lead, director, dev, viewer, disabled, outsider] = (await Promise.all(
      ['pm', 'lead', 'director', 'dev', 'viewer', 'disabled', 'outsider'].map(user))) as [string, string, string, string, string, string, string];
    for (const [who, role] of [[pm, 'pm'], [lead, 'lead'], [director, 'director']] as const) {
      await owner!.query('INSERT INTO phs.practice_membership(practice_id, user_id, role) VALUES($1, $2, $3)', [practice, who, role]);
    }
    await owner!.query('UPDATE phs.app_user SET active = false WHERE id = $1', [disabled]);
  });

  it('records an observation and computes the deviation against actual progress', async () => {
    const project = await withBaseline('100000');
    const before = await revision(project.id);
    const by = actor(pm);
    const observation = await finance.record(by, project.id, { effectiveOn: day(-1), totalCost: '54000', totalEffortHours: '480.5', source: 'ERP', supersedesId: null }, randomUUID());
    expect(() => financialObservation.strict().parse(observation)).not.toThrow();
    expect(observation).toMatchObject({ totalCost: '54000.00', totalEffortHours: '480.50', source: 'ERP', recordedBy: { id: pm }, superseded: false });
    expect(await revision(project.id)).toBe(before + 1);
    expect((await value('SELECT action FROM phs.audit_entry WHERE request_id = $1', [by.requestId])).action).toBe('finance.recorded');
    const summary = await finance.summary(pm, project.id);
    expect(() => financeSummary.strict().parse(summary)).not.toThrow();
    // Rules v1, example 5: budget 100,000, progress 50%, cost 54,000 -> 4%, gate on.
    expect(summary).toMatchObject({
      currency: 'USD', budget: '100000.00', effortBudgetHours: '1000.00', actualProgress: '50.00', expectedCost: '50000.00',
      deviation: '4.00', gate: true, missing: [], ruleSetVersion: 'phf-v1', current: { id: observation.id },
    });
  });

  it('selects the applicable observation for a date and never adds accumulated figures', async () => {
    const project = await withBaseline('100000');
    await observe(project.id, { effectiveOn: day(-20), totalCost: '20000' });
    await observe(project.id, { effectiveOn: day(-5), totalCost: '53000' });
    expect((await finance.summary(pm, project.id)).current?.totalCost).toBe('53000.00');
    expect(await finance.summary(pm, project.id)).toMatchObject({ deviation: '3.00', gate: false });
    expect((await finance.summary(pm, project.id, day(-10))).current?.totalCost).toBe('20000.00');
    const early = await finance.summary(pm, project.id, day(-30));
    expect(early).toMatchObject({ current: null, deviation: null, missing: ['cost'] });
    expect(early.observations).toHaveLength(2);
  });

  it('a correction keeps the original and replaces it as the applicable figure', async () => {
    const project = await withBaseline('100000');
    const original = await observe(project.id, { totalCost: '90000' });
    const corrected = await observe(project.id, { totalCost: '51000', supersedesId: original.id });
    expect(corrected.supersedesId).toBe(original.id);
    const summary = await finance.summary(lead, project.id);
    expect(summary.current?.id).toBe(corrected.id);
    expect(summary.deviation).toBe('1.00');
    expect(summary.observations.map((o) => [o.totalCost, o.superseded])).toEqual([['51000.00', false], ['90000.00', true]]);
    await expect(observe(project.id, { supersedesId: original.id })).rejects.toMatchObject({ code: 'already_superseded' });
    await expect(observe(project.id, { supersedesId: randomUUID() })).rejects.toMatchObject({ code: 'not_found' });
    await expect(owner!.query('UPDATE phs.financial_observation SET total_cost = 1 WHERE id = $1', [original.id])).rejects.toMatchObject({ code: '55000' });
  });

  it('shows missing data instead of inventing a deviation', async () => {
    const unknownBudget = await withBaseline(null);
    await observe(unknownBudget.id);
    expect(await finance.summary(pm, unknownBudget.id)).toMatchObject({ budget: null, deviation: null, gate: false, missing: ['budget'] });
    const noBaseline = await newProject();
    await observe(noBaseline.id);
    expect(await finance.summary(pm, noBaseline.id)).toMatchObject({ budget: null, actualProgress: null, deviation: null, missing: ['budget', 'progress'] });
  });

  it('restricts economy to those who govern the project', async () => {
    const project = await withBaseline('100000');
    await team.put(actor(pm), project.id, viewer, { role: 'viewer', allocationPct: null });
    expect((await finance.summary(director, project.id)).budget).toBe('100000.00');
    await expect(finance.summary(viewer, project.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(finance.summary(dev, project.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(finance.summary(outsider, project.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(observe(project.id, {}, director)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(observe(project.id, {}, viewer)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(observe(project.id, { effectiveOn: day(3) })).rejects.toMatchObject({ code: 'invalid_effective_date' });
    await expect(observe(project.id, { totalCost: '-5' })).rejects.toMatchObject({ code: '23514' });
  });

  const riskInput = (overrides: Partial<CreateRisk> = {}): CreateRisk => ({
    title: 'Proveedor sin capacidad', description: 'Puede retrasar la integración', riskType: 'project', category: 'supplier',
    probability: 2, impact: 3, ownerId: dev, mitigationDueOn: day(15), strategy: 'Buscar segundo proveedor', ...overrides,
  });

  it('registers a risk with its severity and first history entry', async () => {
    const project = await newProject();
    const key = randomUUID();
    const created = await risks.create(actor(pm), project.id, riskInput(), key);
    expect(() => riskSchema.strict().parse(created)).not.toThrow();
    expect(created).toMatchObject({ status: 'open', severity: 6, overdue: false, revision: 1, owner: { id: dev }, canUpdate: true });
    expect((await risks.create(actor(pm), project.id, riskInput(), key)).id).toBe(created.id);
    expect(await revision(project.id)).toBe(2);
    await expect(risks.create(actor(pm), project.id, riskInput({ ownerId: disabled }), randomUUID())).rejects.toMatchObject({ code: 'responsible_not_enabled' });
    await expect(risks.create(actor(director), project.id, riskInput(), randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(risks.create(actor(outsider), project.id, riskInput(), randomUUID())).rejects.toMatchObject({ code: 'not_found' });
    // Values outside the catalogue are also refused by the database.
    await expect(risks.create(actor(pm), project.id, riskInput({ probability: 4 }), randomUUID())).rejects.toMatchObject({ code: '23514' });
    const history = await risks.history(pm, project.id, created.id);
    expect(() => riskHistoryEntry.strict().array().parse(history)).not.toThrow();
    expect(history.map((h) => h.note)).toEqual(['Riesgo registrado']);
  });

  it('each follow-up keeps the comment and the values before and after', async () => {
    const project = await newProject();
    const created = await risks.create(actor(pm), project.id, riskInput(), randomUUID());
    // The owner is not PM, lead or member: the risk alone gives access to it.
    const updated = await risks.followUp(actor(dev), project.id, created.id, {
      expectedRevision: 1, comment: 'Se contactó a un segundo proveedor', status: 'mitigating', probability: 1, mitigationDueOn: day(20),
    });
    expect(updated).toMatchObject({ status: 'mitigating', probability: 1, severity: 3, revision: 2, mitigationDueOn: day(20) });
    const [latest] = await risks.history(dev, project.id, created.id);
    expect(latest).toMatchObject({
      note: 'Se contactó a un segundo proveedor', actor: { id: dev },
      before: { probability: 2, status: 'open', mitigationDueOn: day(15) },
      after: { probability: 1, status: 'mitigating', mitigationDueOn: day(20) },
    });
    await expect(risks.followUp(actor(dev), project.id, created.id, { expectedRevision: 1, comment: 'tarde' })).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: 2 });
    await expect(risks.followUp(actor(dev), project.id, created.id, { expectedRevision: 2, comment: 'reasignar', ownerId: pm })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(risks.followUp(actor(director), project.id, created.id, { expectedRevision: 2, comment: 'x' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(risks.followUp(actor(outsider), project.id, created.id, { expectedRevision: 2, comment: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    const reassigned = await risks.followUp(actor(lead), project.id, created.id, { expectedRevision: 2, comment: 'Lo toma el PM', ownerId: pm });
    expect(reassigned.owner.id).toBe(pm);
    await expect(risks.followUp(actor(dev), project.id, created.id, { expectedRevision: 3, comment: 'ya no es mío' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(risks.followUp(actor(pm), project.id, created.id, { expectedRevision: 3, comment: 'x', ownerId: disabled })).rejects.toMatchObject({ code: 'responsible_not_enabled' });
  });

  it('materializing is not mitigating; closing and reopening keep the history', async () => {
    const project = await newProject();
    const r = await risks.create(actor(pm), project.id, riskInput(), randomUUID());
    const step = async (status: 'open' | 'mitigating' | 'mitigated' | 'materialized' | 'closed', comment: string) => {
      const current = (await risks.list(pm, project.id)).find((x) => x.id === r.id)!;
      return risks.followUp(actor(pm), project.id, r.id, { expectedRevision: current.revision, comment, status });
    };
    await expect(step('mitigated', 'sin pasar por mitigación')).rejects.toMatchObject({ code: 'invalid_transition' });
    expect((await step('materialized', 'El proveedor incumplió')).status).toBe('materialized');
    await expect(step('mitigated', 'no aplica')).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(step('open', 'no aplica')).rejects.toMatchObject({ code: 'invalid_transition' });
    expect((await step('closed', 'Impacto absorbido con horas extra')).status).toBe('closed');
    expect((await step('open', 'Volvió a presentarse')).status).toBe('open');
    expect((await risks.history(pm, project.id, r.id)).map((h) => h.note)).toEqual([
      'Volvió a presentarse', 'Impacto absorbido con horas extra', 'El proveedor incumplió', 'Riesgo registrado',
    ]);
  });

  it('lists open risks first and flags the ones past their mitigation date', async () => {
    const project = await newProject();
    const late = await risks.create(actor(pm), project.id, riskInput({ title: 'Vencido', mitigationDueOn: day(-2), probability: 1, impact: 1 }), randomUUID());
    const high = await risks.create(actor(pm), project.id, riskInput({ title: 'Alto', probability: 3, impact: 3 }), randomUUID());
    const done = await risks.create(actor(pm), project.id, riskInput({ title: 'Cerrado', mitigationDueOn: day(-5) }), randomUUID());
    await risks.followUp(actor(pm), project.id, done.id, { expectedRevision: 1, comment: 'Ya no aplica', status: 'closed' });
    const listed = await risks.list(pm, project.id);
    expect(listed.map((x) => [x.title, x.overdue])).toEqual([['Alto', false], ['Vencido', true], ['Cerrado', false]]);
    expect(listed.find((x) => x.id === high.id)?.severity).toBe(9);
    expect(late.overdue).toBe(true);
  });
});
