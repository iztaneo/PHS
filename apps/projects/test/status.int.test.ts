import { randomUUID } from 'node:crypto';
import { inactiveProject, projectDetail, projectStatusView, renewal as renewalSchema } from '@phs/contracts';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MilestonesService } from '../src/milestones.service.js';
import { ProjectsService } from '../src/projects.service.js';
import { RisksService } from '../src/risks.service.js';
import { StatusService } from '../src/status.service.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.PROJECTS_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;

const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const user = (name: string) =>
  id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [name, `${name}-${randomUUID()}@example.invalid`]);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('project status and renewals (PHS-014, PHS-013, D08)', () => {
  const projects = new ProjectsService(pool!);
  const status = new StatusService(pool!, projects);
  const milestones = new MilestonesService(pool!, projects);
  const risks = new RisksService(pool!, projects);
  let practice = ''; let pm = ''; let lead = ''; let director = ''; let dev = ''; let outsider = '';
  const actor = (userId: string) => ({ userId, requestId: randomUUID() });
  const newProject = async () => (await projects.create(actor(pm), {
    practiceId: practice, code: `S-${randomUUID().slice(0, 8)}`, name: 'Proyecto', description: '', clientName: `Cliente ${randomUUID().slice(0, 8)}`,
    serviceTypeCode: 'support', pmId: pm, leadId: lead, technicalOwnerId: lead, sponsorId: null, clientContact: '', escalationNotes: '',
    startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'MXN',
  }, randomUUID())).project;
  const move = async (by: string, projectId: string, to: 'active' | 'paused' | 'renewing' | 'closed' | 'planned', reason = 'Motivo', at?: Date) =>
    status.change(actor(by), projectId, { expectedRevision: (await projects.get(lead, projectId))!.revision, to, reason }, at);

  beforeAll(async () => {
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`S${randomUUID().slice(0, 8)}`, 'Práctica']);
    [pm, lead, director, dev, outsider] = (await Promise.all(['pm', 'lead', 'director', 'dev', 'outsider'].map(user))) as [string, string, string, string, string];
    for (const [who, role] of [[pm, 'pm'], [lead, 'lead'], [director, 'director']] as const) {
      await owner!.query('INSERT INTO phs.practice_membership(practice_id, user_id, role) VALUES($1, $2, $3)', [practice, who, role]);
    }
  });

  it('every transition needs a reason and leaves author and date; invalid ones are refused', async () => {
    const p = await newProject();
    const started = await move(pm, p.id, 'active', 'Kickoff realizado');
    expect(() => projectDetail.strict().parse(started)).not.toThrow();
    expect(started).toMatchObject({ status: 'active', revision: 2, justificationRequired: false });
    await expect(move(pm, p.id, 'planned')).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(status.change(actor(pm), p.id, { expectedRevision: 1, to: 'paused', reason: 'x' })).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: 2 });
    await expect(move(director, p.id, 'paused')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(move(outsider, p.id, 'paused')).rejects.toMatchObject({ code: 'not_found' });
    // Closing and reopening are the lead's decision.
    await expect(move(pm, p.id, 'closed')).rejects.toMatchObject({ code: 'forbidden' });
    await move(pm, p.id, 'paused', 'El cliente congeló el presupuesto');
    await expect(move(pm, p.id, 'closed')).rejects.toMatchObject({ code: 'invalid_transition' });
    await move(pm, p.id, 'active', 'Presupuesto liberado');
    await move(lead, p.id, 'closed', 'Entrega final aceptada');
    await expect(move(pm, p.id, 'active')).rejects.toMatchObject({ code: 'forbidden' });
    await move(lead, p.id, 'active', 'El cliente pidió una fase adicional');
    const view = await status.get(pm, p.id);
    expect(() => projectStatusView.strict().parse(view)).not.toThrow();
    expect(view.history.map((h) => [h.fromStatus, h.toStatus, h.reason, h.recordedBy.id])).toEqual([
      ['closed', 'active', 'El cliente pidió una fase adicional', lead],
      ['active', 'closed', 'Entrega final aceptada', lead],
      ['paused', 'active', 'Presupuesto liberado', pm],
      ['active', 'paused', 'El cliente congeló el presupuesto', pm],
      ['planned', 'active', 'Kickoff realizado', pm],
    ]);
    expect(view.allowed).toEqual(['paused', 'renewing']);
    expect((await status.get(lead, p.id)).allowed).toEqual(['paused', 'renewing', 'closed']);
    expect((await status.get(director, p.id)).allowed).toEqual([]);
  });

  it('closing shows what is still open and removes nothing', async () => {
    const p = await newProject();
    await move(pm, p.id, 'active');
    await milestones.create(actor(pm), p.id, { title: 'Abierto', deliverable: '', ownerId: dev, dueOn: day(10), critical: false }, randomUUID());
    await risks.create(actor(pm), p.id, { title: 'Riesgo', description: '', riskType: 'project', category: 'scope', probability: 1, impact: 1, ownerId: dev, mitigationDueOn: day(10), strategy: '' }, randomUUID());
    await status.createRenewal(actor(pm), p.id, { dueOn: day(30), ownerId: pm, notes: '' }, randomUUID());
    expect((await status.get(lead, p.id)).open).toEqual({ milestones: 1, risks: 1, renewals: 1, tasks: 0 });
    await move(lead, p.id, 'closed', 'Cierre anticipado por el cliente');
    expect((await status.get(lead, p.id)).open).toEqual({ milestones: 1, risks: 1, renewals: 1, tasks: 0 });
    expect(await milestones.list(dev, p.id)).toHaveLength(1);
  });

  it('D08: after a month paused the PM must explain the situation before editing again', async () => {
    const p = await newProject();
    await move(pm, p.id, 'active', 'Inicio', ago(60));
    await move(pm, p.id, 'paused', 'El cliente suspendió el contrato', ago(29));
    // 29 days: nothing is required yet.
    expect((await projects.get(pm, p.id))?.justificationRequired).toBe(false);
    await expect(status.justify(actor(pm), p.id, 'Aún no toca')).rejects.toMatchObject({ code: 'justification_not_required' });
    expect((await projects.update(actor(pm), p.id, { expectedRevision: 3, description: 'Editable' })).revision).toBe(4);

    const q = await newProject();
    await move(pm, q.id, 'active', 'Inicio', ago(90));
    await move(pm, q.id, 'paused', 'El cliente suspendió el contrato', ago(40));
    const blocked = (await projects.get(pm, q.id))!;
    expect(blocked.justificationRequired).toBe(true);
    expect((await projects.list(pm, { q: blocked.code, page: 1, pageSize: 5 })).items[0]?.justificationRequired).toBe(true);
    // Every edit is refused, for the lead too, until the situation is described.
    const rev = blocked.revision;
    await expect(projects.update(actor(pm), q.id, { expectedRevision: rev, description: 'x' })).rejects.toMatchObject({ code: 'status_justification_required' });
    await expect(milestones.create(actor(lead), q.id, { title: 'x', deliverable: '', ownerId: pm, dueOn: day(5), critical: false }, randomUUID())).rejects.toMatchObject({ code: 'status_justification_required' });
    await expect(move(pm, q.id, 'active', 'Reanudar sin explicar')).rejects.toMatchObject({ code: 'status_justification_required' });
    await expect(status.justify(actor(director), q.id, 'No me corresponde')).rejects.toMatchObject({ code: 'forbidden' });
    // Reading is never blocked.
    expect((await status.get(director, q.id)).justificationRequired).toBe(true);

    const by = actor(pm);
    const view = await status.justify(by, q.id, 'El cliente sigue sin presupuesto; se retoma en enero.');
    expect(view.justificationRequired).toBe(false);
    expect(view.history[0]).toMatchObject({ kind: 'justification', fromStatus: null, toStatus: 'paused', reason: 'El cliente sigue sin presupuesto; se retoma en enero.', recordedBy: { id: pm } });
    expect((await owner!.query('SELECT action FROM phs.audit_entry WHERE request_id = $1', [by.requestId])).rows[0].action).toBe('project.status_justified');
    await expect(status.justify(actor(pm), q.id, 'Otra vez')).rejects.toMatchObject({ code: 'justification_not_required' });
    expect((await move(pm, q.id, 'active', 'Presupuesto aprobado')).status).toBe('active');
  });

  it('D08 applies to closed projects, and a justification from before the month does not count', async () => {
    const p = await newProject();
    await move(pm, p.id, 'active', 'Inicio', ago(100));
    await move(lead, p.id, 'closed', 'Cierre', ago(45));
    await owner!.query(
      `INSERT INTO phs.project_status_log(project_id, kind, to_status, reason, recorded_by, recorded_at) VALUES($1, 'justification', 'closed', 'Nota temprana', $2, $3)`,
      [p.id, pm, ago(40)]);
    expect((await projects.get(lead, p.id))?.justificationRequired).toBe(true);
    await status.justify(actor(lead), p.id, 'Cerrado en espera del finiquito.');
    expect((await projects.get(lead, p.id))?.justificationRequired).toBe(false);
  });

  it('renewals keep their original date and outcome, and a new period does not touch the previous one', async () => {
    const p = await newProject();
    const key = randomUUID();
    const first = await status.createRenewal(actor(pm), p.id, { dueOn: day(-5), ownerId: dev, notes: 'Contrato anual' }, key);
    expect(() => renewalSchema.strict().parse(first)).not.toThrow();
    expect(first).toMatchObject({ status: 'pending', dueOn: day(-5), overdue: true, owner: { id: dev }, revision: 1, canUpdate: true });
    expect((await status.createRenewal(actor(pm), p.id, { dueOn: day(-5), ownerId: dev, notes: 'Contrato anual' }, key)).id).toBe(first.id);
    // The owner sees the project through the renewal and can decide it.
    expect((await status.listRenewals(dev, p.id))[0]?.canUpdate).toBe(true);
    await expect(status.decideRenewal(actor(director), p.id, first.id, { expectedRevision: 1, outcome: 'renewed', comment: 'x' })).rejects.toMatchObject({ code: 'forbidden' });
    const renewed = await status.decideRenewal(actor(dev), p.id, first.id, { expectedRevision: 1, outcome: 'renewed', comment: 'Renovado por doce meses' });
    expect(renewed).toMatchObject({ status: 'renewed', dueOn: day(-5), outcomeNote: 'Renovado por doce meses', overdue: false, canUpdate: false, revision: 2 });
    await expect(status.decideRenewal(actor(pm), p.id, first.id, { expectedRevision: 1, outcome: 'cancelled', comment: 'tarde' })).rejects.toMatchObject({ code: 'revision_conflict' });
    await expect(status.decideRenewal(actor(pm), p.id, first.id, { expectedRevision: 2, outcome: 'cancelled', comment: 'ya decidido' })).rejects.toMatchObject({ code: 'invalid_transition' });
    const second = await status.createRenewal(actor(pm), p.id, { dueOn: day(360), ownerId: pm, notes: '' }, randomUUID());
    const listed = await status.listRenewals(pm, p.id);
    expect(listed.map((r) => [r.id, r.status])).toEqual([[second.id, 'pending'], [first.id, 'renewed']]);
    expect(listed[0]?.daysToDue).toBeGreaterThan(350);
    await expect(status.createRenewal(actor(pm), p.id, { dueOn: day(10), ownerId: randomUUID(), notes: '' }, randomUUID())).rejects.toMatchObject({ code: 'responsible_not_enabled' });
    await expect(status.createRenewal(actor(dev), p.id, { dueOn: day(10), ownerId: dev, notes: '' }, randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('PHS-046: lists paused and closed projects with reason, age, justification and what was left open', async () => {
    const running = await newProject();
    await move(pm, running.id, 'active', 'Inicio');
    const recent = await newProject();
    await move(pm, recent.id, 'active', 'Inicio', ago(50));
    await milestones.create(actor(pm), recent.id, { title: 'Pendiente', deliverable: '', ownerId: dev, dueOn: day(20), critical: false }, randomUUID());
    await move(pm, recent.id, 'paused', 'Vacaciones del cliente', ago(10));
    const stale = await newProject();
    await move(pm, stale.id, 'active', 'Inicio', ago(120));
    await move(pm, stale.id, 'paused', 'Sin presupuesto', ago(45));
    const explained = await newProject();
    await move(pm, explained.id, 'active', 'Inicio', ago(200));
    // Closing is the lead's decision.
    await move(lead, explained.id, 'closed', 'Contrato terminado', ago(100));
    await status.justify(actor(pm), explained.id, 'Cierre administrativo concluido.');

    const report = await projects.inactive(lead);
    expect(() => inactiveProject.strict().array().parse(report)).not.toThrow();
    const mine = report.filter((r) => [running.id, recent.id, stale.id, explained.id].includes(r.id));
    // Those that owe a justification first; an active project is never listed.
    expect(mine.map((r) => r.id)).toEqual([stale.id, explained.id, recent.id]);
    expect(mine[0]).toMatchObject({ status: 'paused', reason: 'Sin presupuesto', days: 45, justificationRequired: true, lastJustification: null, changedBy: 'pm' });
    expect(mine[1]).toMatchObject({ status: 'closed', changedBy: 'lead', days: 100, justificationRequired: false, lastJustification: { text: 'Cierre administrativo concluido.', by: 'pm' } });
    expect(mine[2]).toMatchObject({ days: 10, justificationRequired: false, stopped: { openMilestones: 1, openRisks: 0, openActions: 0, pendingRenewals: 0, reviewCycle: false } });
    // Only within the user's scope: Dirección sees them, someone outside the practice does not.
    expect((await projects.inactive(director)).some((r) => r.id === stale.id)).toBe(true);
    expect(await projects.inactive(outsider)).toEqual([]);
  });
});
