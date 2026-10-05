// Loads demo projects through the same services the API uses, so audit, revisions and rules apply.
// Safe to run again: a project whose code already exists is left untouched.
// Extend this file with every new feature, so there is always data to try the whole flow.
import { randomUUID } from 'node:crypto';
import { createPool, loadEnv, requireEnv } from '@phs/service-kit';
import { BaselinesService } from '../baselines.service.js';
import { ChangesService } from '../changes.service.js';
import { FinanceService } from '../finance.service.js';
import { MilestonesService } from '../milestones.service.js';
import { ProjectsService } from '../projects.service.js';
import { RisksService } from '../risks.service.js';
import { StatusService } from '../status.service.js';
import { TeamService } from '../team.service.js';

loadEnv();
const pool = createPool(requireEnv('PROJECTS_DATABASE_URL'));
const projects = new ProjectsService(pool);
const team = new TeamService(pool, projects);
const milestones = new MilestonesService(pool, projects);
const baselines = new BaselinesService(pool, projects);
const finance = new FinanceService(pool, projects);
const risks = new RisksService(pool, projects);
const changes = new ChangesService(pool, projects);
const status = new StatusService(pool, projects);

// Dates are relative to today so overdue and upcoming items stay meaningful whenever the seed runs.
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const key = () => randomUUID();

async function idOf(table: 'app_user' | 'practice', column: 'email' | 'code', value: string): Promise<string> {
  const found = await pool.query<{ id: string }>(`SELECT id FROM phs.${table} WHERE ${column} = $1`, [value]);
  if (!found.rows[0]) throw new Error(`Falta ${value}. Ejecuta primero el seed de usuarios (pnpm seed:demo).`);
  return found.rows[0].id;
}
const exists = async (code: string) => Boolean((await pool.query('SELECT 1 FROM phs.project WHERE code = $1', [code])).rowCount);

try {
  const [ana, luis, pablo, diego, elena, cons, data] = await Promise.all([
    idOf('app_user', 'email', 'ana.pm@phs.test'), idOf('app_user', 'email', 'luis.lider@phs.test'),
    idOf('app_user', 'email', 'pablo.pm@phs.test'), idOf('app_user', 'email', 'diego.dev@phs.test'),
    idOf('app_user', 'email', 'elena.lectora@phs.test'), idOf('practice', 'code', 'CONS'), idOf('practice', 'code', 'DATA'),
  ]);
  const as = (userId: string) => ({ userId, requestId: randomUUID() });
  const revision = async (userId: string, projectId: string) => (await projects.get(userId, projectId))!.revision;
  const base = { description: '', sponsorId: null, currency: 'MXN', technicalOwnerId: diego };

  // 1. In trouble: critical milestone overdue, spending ahead of progress, one materialized and one overdue risk.
  if (!(await exists('DEMO-001'))) {
    const { project } = await projects.create(as(ana), {
      ...base, practiceId: cons, code: 'DEMO-001', name: 'Portal de clientes', clientName: 'Grupo Altamira',
      serviceTypeCode: 'development', pmId: ana, leadId: luis, startsOn: day(-120), endsOn: day(90),
      description: 'Portal de autoservicio para clientes corporativos.',
      clientContact: 'María Solís, directora de TI', escalationNotes: 'Escalar a Luis Herrera y después a la dirección del cliente.',
    }, key());
    const id = project.id;
    await team.put(as(ana), id, diego, { role: 'contributor', allocationPct: 80 });
    await team.put(as(ana), id, elena, { role: 'viewer', allocationPct: null });
    const design = await milestones.create(as(ana), id, { title: 'Diseño aprobado', deliverable: 'Acta de aprobación del diseño', ownerId: diego, dueOn: day(-75), critical: false }, key());
    const api = await milestones.create(as(ana), id, { title: 'Integración con facturación', deliverable: 'API en ambiente de pruebas', ownerId: diego, dueOn: day(-12), critical: true }, key());
    await milestones.create(as(ana), id, { title: 'Pruebas de aceptación', deliverable: 'Acta de pruebas firmada', ownerId: ana, dueOn: day(25), critical: false }, key());
    await milestones.create(as(ana), id, { title: 'Salida a producción', deliverable: 'Portal publicado', ownerId: ana, dueOn: day(70), critical: true }, key());
    await baselines.publishInitial(as(ana), id, {
      expectedRevision: await revision(ana, id), scope: 'Portal con consulta de facturas, pagos y tickets.', budget: '1200000', effortHours: '4800', reason: 'Línea base inicial',
    }, key());
    await milestones.transition(as(diego), id, design.id, { expectedRevision: 1, to: 'completed', note: 'Diseño aprobado por el cliente, con una semana de retraso.', completedOn: day(-68) });
    await milestones.transition(as(diego), id, api.id, { expectedRevision: 1, to: 'in_progress' });
    await finance.record(as(ana), id, { effectiveOn: day(-45), totalCost: '380000', totalEffortHours: '1500', source: 'Reporte de costos, hace dos meses', supersedesId: null }, key());
    await finance.record(as(ana), id, { effectiveOn: day(-10), totalCost: '690000', totalEffortHours: '2900', source: 'Reporte de costos, mes pasado', supersedesId: null }, key());
    const supplier = await risks.create(as(ana), id, { title: 'El proveedor de facturación no entrega su API', description: 'La integración depende de un tercero.', riskType: 'project', category: 'supplier', probability: 3, impact: 3, ownerId: diego, mitigationDueOn: day(-20), strategy: 'Construir un simulador y escalar con el proveedor.' }, key());
    await risks.followUp(as(diego), id, supplier.id, { expectedRevision: 1, comment: 'El proveedor confirmó que no entregará en la fecha acordada.', status: 'materialized' });
    await risks.create(as(ana), id, { title: 'El cliente cambia prioridades cada semana', description: '', riskType: 'client', category: 'client', probability: 2, impact: 2, ownerId: ana, mitigationDueOn: day(-3), strategy: 'Acordar un comité semanal de cambios.' }, key());
    console.log('Proyecto creado: DEMO-001 Portal de clientes (en problemas)');
  }

  // 2. On track: milestones on time, cost in line with progress, one mitigated risk.
  if (!(await exists('DEMO-002'))) {
    const { project } = await projects.create(as(ana), {
      ...base, practiceId: cons, code: 'DEMO-002', name: 'Migración a la nube', clientName: 'Banco del Centro',
      serviceTypeCode: 'architecture', pmId: ana, leadId: luis, startsOn: day(-90), endsOn: day(60),
      clientContact: 'Jorge Peña, arquitecto en jefe', escalationNotes: 'Escalar a Luis Herrera.',
    }, key());
    const id = project.id;
    await team.put(as(ana), id, diego, { role: 'contributor', allocationPct: 20 });
    const one = await milestones.create(as(ana), id, { title: 'Inventario de aplicaciones', deliverable: 'Inventario validado', ownerId: ana, dueOn: day(-60), critical: false }, key());
    const two = await milestones.create(as(ana), id, { title: 'Ambiente destino listo', deliverable: 'Ambiente certificado', ownerId: diego, dueOn: day(-20), critical: true }, key());
    await milestones.create(as(ana), id, { title: 'Migración de producción', deliverable: 'Aplicaciones operando en la nube', ownerId: ana, dueOn: day(40), critical: true }, key());
    await baselines.publishInitial(as(ana), id, {
      expectedRevision: await revision(ana, id), scope: 'Migración de doce aplicaciones.', budget: '900000', effortHours: '3000', reason: 'Línea base inicial',
    }, key());
    await milestones.transition(as(ana), id, one.id, { expectedRevision: 1, to: 'completed', note: 'Inventario validado por el cliente.', completedOn: day(-62) });
    await milestones.transition(as(diego), id, two.id, { expectedRevision: 1, to: 'completed', note: 'Ambiente certificado por seguridad.', completedOn: day(-21) });
    await finance.record(as(ana), id, { effectiveOn: day(-8), totalCost: '585000', totalEffortHours: '1950', source: 'Reporte de costos, mes pasado', supersedesId: null }, key());
    const capacity = await risks.create(as(ana), id, { title: 'Ventana de migración insuficiente', description: '', riskType: 'project', category: 'schedule', probability: 2, impact: 2, ownerId: ana, mitigationDueOn: day(-30), strategy: 'Negociar dos fines de semana adicionales.' }, key());
    const mitigating = await risks.followUp(as(ana), id, capacity.id, { expectedRevision: 1, comment: 'El cliente aceptó evaluar ventanas adicionales.', status: 'mitigating' });
    await risks.followUp(as(ana), id, capacity.id, { expectedRevision: mitigating.revision, comment: 'El cliente autorizó dos ventanas adicionales.', status: 'mitigated' });
    console.log('Proyecto creado: DEMO-002 Migración a la nube (en orden)');
  }

  // 3. Just started: team and milestones registered, baseline still to be published.
  if (!(await exists('DEMO-003'))) {
    const { project } = await projects.create(as(ana), {
      ...base, practiceId: cons, code: 'DEMO-003', name: 'Soporte de aplicaciones', clientName: 'Grupo Altamira',
      serviceTypeCode: 'support', pmId: ana, leadId: luis, startsOn: day(-5), endsOn: day(360), clientContact: '', escalationNotes: '',
    }, key());
    const id = project.id;
    await team.put(as(ana), id, diego, { role: 'contributor', allocationPct: null });
    await milestones.create(as(ana), id, { title: 'Transición del servicio', deliverable: 'Acta de recepción del servicio', ownerId: ana, dueOn: day(30), critical: true }, key());
    await milestones.create(as(ana), id, { title: 'Primer informe mensual', deliverable: 'Informe de niveles de servicio', ownerId: diego, dueOn: day(45), critical: false }, key());
    await risks.create(as(ana), id, { title: 'Documentación del sistema incompleta', description: '', riskType: 'client', category: 'technical', probability: 2, impact: 2, ownerId: diego, mitigationDueOn: day(20), strategy: 'Sesiones de transferencia con el equipo saliente.' }, key());
    console.log('Proyecto creado: DEMO-003 Soporte de aplicaciones (sin línea base)');
  }

  // 4. Another practice: only its own PM, its lead and Direction can see it.
  if (!(await exists('DEMO-004'))) {
    const { project } = await projects.create(as(pablo), {
      ...base, practiceId: data, code: 'DEMO-004', name: 'Modelo de predicción de demanda', clientName: 'Comercial del Norte',
      serviceTypeCode: 'data_ai', pmId: pablo, leadId: pablo, technicalOwnerId: pablo, startsOn: day(-30), endsOn: day(120),
      clientContact: 'Sofía Lara, gerente de planeación', escalationNotes: '',
    }, key());
    await milestones.create(as(pablo), project.id, { title: 'Datos históricos consolidados', deliverable: 'Conjunto de datos validado', ownerId: pablo, dueOn: day(15), critical: false }, key());
    console.log('Proyecto creado: DEMO-004 Modelo de predicción de demanda (otra práctica)');
  }
  // Changes (PHS-018/019). Added per project only when it has none, so older local databases get them too.
  const demo = async (code: string) => (await pool.query<{ id: string }>('SELECT id FROM phs.project WHERE code = $1', [code])).rows[0]!.id;
  const hasChanges = async (id: string) => Boolean((await pool.query('SELECT 1 FROM phs.project_change WHERE project_id = $1 LIMIT 1', [id])).rowCount);
  const milestoneId = async (id: string, title: string) =>
    (await pool.query<{ id: string }>('SELECT id FROM phs.milestone WHERE project_id = $1 AND title = $2', [id, title])).rows[0]?.id;

  const portal = await demo('DEMO-001');
  if (!(await hasChanges(portal))) {
    const integration = await milestoneId(portal, 'Integración con facturación');
    if (integration) {
      // Pending: waiting for the lead's decision.
      await changes.propose(as(ana), portal, {
        title: 'Replanificar la integración con facturación', changeType: 'technical', correctsId: null,
        description: 'El proveedor no entregó su API; se necesita más tiempo y presupuesto para construir un simulador.',
        impact: { budgetDelta: '150000', milestones: [{ id: integration, dueOn: day(20) }] },
      }, key());
      console.log('Cambio propuesto en DEMO-001 (pendiente de decisión)');
    }
  }
  const cloud = await demo('DEMO-002');
  if (!(await hasChanges(cloud))) {
    const production = await milestoneId(cloud, 'Migración de producción');
    if (production) {
      // Approved: produces baseline v2 and moves only that milestone.
      const proposed = await changes.propose(as(ana), cloud, {
        title: 'Ampliar la ventana de migración', changeType: 'client', correctsId: null,
        description: 'El banco pidió mover la migración después de su cierre trimestral.',
        impact: { endsOn: day(75), milestones: [{ id: production, dueOn: day(55) }] },
      }, key());
      await changes.decide(as(luis), cloud, proposed.id, { decision: 'approved', comment: 'Aprobado en comité; sin impacto en presupuesto.' }, key());
      console.log('Cambio aprobado en DEMO-002 (línea base v2)');
    }
  }
  // Status and renewals (PHS-013/014, D08).
  const hasLog = async (id: string) => Boolean((await pool.query('SELECT 1 FROM phs.project_status_log WHERE project_id = $1 LIMIT 1', [id])).rowCount);
  const hasRenewals = async (id: string) => Boolean((await pool.query('SELECT 1 FROM phs.renewal WHERE project_id = $1 LIMIT 1', [id])).rowCount);
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
  for (const [code, days] of [['DEMO-001', 118], ['DEMO-002', 88]] as const) {
    const id = await demo(code);
    if (!(await hasLog(id))) {
      await status.change(as(ana), id, { expectedRevision: await revision(ana, id), to: 'active', reason: 'Kickoff realizado con el cliente.' }, ago(days));
      console.log(`${code} puesto en ejecución`);
    }
  }
  if (!(await hasRenewals(cloud))) {
    const past = await status.createRenewal(as(ana), cloud, { dueOn: day(-200), ownerId: ana, notes: 'Contrato marco, periodo anterior' }, key());
    await status.decideRenewal(as(ana), cloud, past.id, { expectedRevision: 1, outcome: 'renewed', comment: 'Renovado por doce meses con el mismo alcance.' });
    await status.createRenewal(as(ana), cloud, { dueOn: day(30), ownerId: ana, notes: 'Contrato marco' }, key());
    console.log('Renovaciones cargadas en DEMO-002');
  }
  // 5. Paused for more than a month: the PM has to describe the situation before editing (D08).
  if (!(await exists('DEMO-005'))) {
    const { project } = await projects.create(as(ana), {
      ...base, practiceId: cons, code: 'DEMO-005', name: 'Tablero de indicadores', clientName: 'Banco del Centro',
      serviceTypeCode: 'consulting', pmId: ana, leadId: luis, startsOn: day(-150), endsOn: day(30),
      clientContact: 'Jorge Peña, arquitecto en jefe', escalationNotes: '',
    }, key());
    await milestones.create(as(ana), project.id, { title: 'Indicadores definidos', deliverable: 'Catálogo de indicadores', ownerId: ana, dueOn: day(20), critical: false }, key());
    await status.change(as(ana), project.id, { expectedRevision: await revision(ana, project.id), to: 'active', reason: 'Inicio del servicio.' }, ago(140));
    await status.change(as(ana), project.id, { expectedRevision: await revision(ana, project.id), to: 'paused', reason: 'El cliente suspendió el proyecto por un cambio de prioridades.' }, ago(45));
    console.log('Proyecto creado: DEMO-005 Tablero de indicadores (pausado hace 45 días, requiere justificación)');
  }
  // 6. Healthy and steady, three weeks into its reviews: the Health seed gives it two past review
  //    cycles so the trend between cycles can be seen (PHS-028).
  if (!(await exists('DEMO-006'))) {
    const { project } = await projects.create(as(ana), {
      ...base, practiceId: cons, code: 'DEMO-006', name: 'Mesa de ayuda corporativa', clientName: 'Grupo Altamira',
      serviceTypeCode: 'support', pmId: ana, leadId: luis, startsOn: day(-120), endsOn: day(240),
      clientContact: 'Marta Solís, gerente de servicios', escalationNotes: 'Escalar a Luis Herrera.',
    }, key());
    const id = project.id;
    await team.put(as(ana), id, diego, { role: 'contributor', allocationPct: 30 });
    const one = await milestones.create(as(ana), id, { title: 'Transición del servicio', deliverable: 'Acta de transición', ownerId: ana, dueOn: day(-80), critical: true }, key());
    const two = await milestones.create(as(ana), id, { title: 'Catálogo de servicios publicado', deliverable: 'Catálogo aprobado', ownerId: diego, dueOn: day(-25), critical: false }, key());
    await milestones.create(as(ana), id, { title: 'Informe semestral de niveles de servicio', deliverable: 'Informe entregado', ownerId: ana, dueOn: day(60), critical: false }, key());
    await baselines.publishInitial(as(ana), id, {
      expectedRevision: await revision(ana, id), scope: 'Mesa de ayuda de primer y segundo nivel.', budget: '600000', effortHours: '2400', reason: 'Línea base inicial',
    }, key());
    await milestones.transition(as(ana), id, one.id, { expectedRevision: 1, to: 'completed', note: 'Transición firmada por el cliente.', completedOn: day(-82) });
    await milestones.transition(as(diego), id, two.id, { expectedRevision: 1, to: 'completed', note: 'Catálogo aprobado.', completedOn: day(-26) });
    await finance.record(as(ana), id, { effectiveOn: day(-5), totalCost: '390000', totalEffortHours: '1560', source: 'Reporte de costos del mes', supersedesId: null }, key());
    await status.change(as(ana), id, { expectedRevision: await revision(ana, id), to: 'active', reason: 'Servicio en operación.' }, ago(118));
    console.log('Proyecto creado: DEMO-006 Mesa de ayuda corporativa (saludable, con historia de revisiones)');
  }
  console.log('Proyectos de demostración listos: DEMO-001 a DEMO-006');
} finally {
  await pool.end();
}
