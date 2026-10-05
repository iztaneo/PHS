import { randomUUID } from 'node:crypto';
import { historyPage, timeline as timelineSchema } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HistoryService } from '../src/history.service.js';
import type { ProjectsClient } from '../src/projects.client.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.PLATFORM_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const VIEW: ProjectCapabilities = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: false };
const day = (offset: number, from: string) => new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('project history and timeline (PHS-038)', () => {
  const projects = {
    capabilities: async (identity: string) => (identity === 'none' ? null : { ...VIEW, seeFinancials: identity === 'finance' }),
  } as unknown as ProjectsClient;
  const history = new HistoryService(pool!, projects);
  let pm = ''; let practice = ''; let client = ''; let today = '';
  const as = (identity = 'reader') => ({ userId: pm, identity });
  const project = () => id(
    `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on)
     VALUES($1, $2, $3, 'Con historia', 'development', $4, $4, $4, '2026-01-01', '2030-12-31') RETURNING id`,
    [practice, client, `H-${randomUUID().slice(0, 8)}`, pm]);
  const audit = (projectId: string, action: string, at: string, after: object, before?: object, entity: [string, string] = ['project', projectId]) => owner!.query(
    `INSERT INTO phs.audit_entry(actor_id, request_id, action, entity_type, entity_id, before_data, after_data, project_id, occurred_at)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [pm, randomUUID(), action, entity[0], entity[1], before ? JSON.stringify(before) : null, JSON.stringify(after), projectId, at]);

  beforeAll(async () => {
    pm = await id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', ['Ana', `ana-${randomUUID()}@example.invalid`]);
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`H${randomUUID().slice(0, 8)}`, 'Práctica']);
    client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
    today = (await owner!.query("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS d")).rows[0].d;
  });

  it('combines what every service recorded, newest first, with author, reason and values', async () => {
    const p = await project();
    await audit(p, 'project.status_changed', '2026-03-01T10:00:00Z', { status: 'active', reason: 'Kickoff realizado.' }, { status: 'planned' });
    await audit(p, 'milestone.completed', '2026-03-05T10:00:00Z', { title: 'Diseño aprobado', status: 'completed', note: 'Firmado por el cliente.' });
    await audit(p, 'finance.recorded', '2026-03-06T10:00:00Z', { totalCost: '380000', totalEffortHours: '1500', effectiveOn: '2026-03-05', source: 'Reporte de costos' });
    const task = await id("INSERT INTO phs.health_task(project_id, title, owner_id, due_on, priority) VALUES($1, 'Llamar al proveedor', $2, '2026-03-20', 'high') RETURNING id", [p, pm]);
    await audit(p, 'task.completed', '2026-03-07T10:00:00Z', { status: 'completed' }, { status: 'pending' }, ['health_task', task]);
    const event = await id(
      `INSERT INTO phs.health_event(project_id, rule_key, condition_key, episode, severity, title, opened_at, resolved_at, resolution_note)
       VALUES($1, 'milestone_overdue', $2, 1, 'critical', 'Hito vencido: Entrega', '2026-03-08T10:00:00Z', '2026-03-09T10:00:00Z', 'Dejó de cumplirse.') RETURNING id`,
      [p, `k:${randomUUID()}`]);
    void event;

    const page = await history.history(as(), p, { limit: 50 });
    expect(() => historyPage.strict().parse(page)).not.toThrow();
    expect(page?.nextCursor).toBeNull();
    expect(page?.items.map((i) => [i.category, i.title, i.detail, i.actor])).toEqual([
      ['alert', 'Alerta resuelta', 'Hito vencido: Entrega · Dejó de cumplirse.', null],
      ['alert', 'Alerta abierta', 'Hito vencido: Entrega · crítica', null],
      ['action', 'Acción completada', 'Llamar al proveedor', 'Ana'],
      // The amounts are only for those who may see the economy.
      ['finance', 'Costo y esfuerzo registrados', 'Cifras no visibles para tu perfil · Reporte de costos', 'Ana'],
      ['milestone', 'Hito completado', 'Diseño aprobado · Firmado por el cliente.', 'Ana'],
      ['project', 'Cambio de estado del proyecto', 'De planeado a activo · Kickoff realizado.', 'Ana'],
    ]);
    expect((await history.history(as('finance'), p, { limit: 50 }))?.items[3]?.detail).toBe('Costo acumulado 380000, esfuerzo 1500 h al 2026-03-05 · Reporte de costos');
    expect(await history.history(as('none'), p, { limit: 50 })).toBeNull();

    // Filters by type and by date; the last day is included whole.
    expect((await history.history(as(), p, { limit: 50, category: 'alert' }))?.items).toHaveLength(2);
    expect((await history.history(as(), p, { limit: 50, from: '2026-03-06', to: '2026-03-07' }))?.items.map((i) => i.title)).toEqual(['Acción completada', 'Costo y esfuerzo registrados']);
  });

  it('pages through everything in a stable order, without skipping or repeating', async () => {
    const p = await project();
    // Many entries in the same instant: the order still has to be deterministic.
    for (let n = 0; n < 7; n += 1) await audit(p, 'milestone.created', '2026-04-01T10:00:00Z', { title: `Hito ${n}` });
    await audit(p, 'milestone.created', '2026-04-02T10:00:00Z', { title: 'Hito final' });
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = (await history.history(as(), p, { limit: 3, cursor }))!;
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
    const all = (await history.history(as(), p, { limit: 50 }))!.items.map((i) => i.id);
    expect(seen).toEqual(all);
    expect((await history.history(as(), p, { limit: 3, cursor: 'no-es-un-cursor' }))).toEqual({ items: [], nextCursor: null });
  });

  it('the timeline separates recent past, what is overdue and what comes within the horizon', async () => {
    const p = await project();
    const milestone = (title: string, dueOn: string, extra = '') => id(
      `INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical ${extra ? ', status, completed_on' : ''}) VALUES($1, $2, $3, $4, false ${extra}) RETURNING id`,
      [p, title, pm, dueOn]);
    await milestone('Atrasado', day(-3, today));
    await milestone('Próximo', day(10, today));
    await milestone('Lejano', day(60, today));
    await milestone('Cumplido', day(-20, today), `, 'completed', '${day(-5, today)}'`);
    await milestone('Cumplido hace mucho', day(-200, today), `, 'completed', '${day(-90, today)}'`);
    const view = await history.timeline(as(), p);
    expect(() => timelineSchema.strict().parse(view)).not.toThrow();
    // No review cycle: two fortnights ahead, and it says so.
    expect(view).toMatchObject({ today, horizon: { until: day(28, today), cycles: 2, cadence: 'fortnightly', assumed: true } });
    expect(view?.overdue.map((i) => i.title)).toEqual(['Atrasado']);
    expect(view?.upcoming.map((i) => i.title)).toEqual(['Próximo']);
    expect(view?.past.map((i) => i.title)).toEqual(['Hito completado: Cumplido']);
    // With a weekly cycle and one cycle ahead, the milestone ten days away is outside.
    await owner!.query("INSERT INTO phs.review_policy(project_id, cadence, anchor_on, forecast_cycles) VALUES($1, 'weekly', CURRENT_DATE, 1)", [p]);
    const narrow = await history.timeline(as(), p);
    expect(narrow?.horizon).toEqual({ until: day(7, today), cycles: 1, cadence: 'weekly', assumed: false });
    expect(narrow?.upcoming).toEqual([]);
    expect(await history.timeline(as('none'), p)).toBeNull();
  });
});
