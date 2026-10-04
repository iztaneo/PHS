// Loads demo projects through the same services the API uses, so audit, revisions and rules apply.
// Safe to run again: a project whose code already exists is left untouched.
// Extend this file with every new feature, so there is always data to try the whole flow.
import { randomUUID } from 'node:crypto';
import { createPool, loadEnv, requireEnv } from '@phs/service-kit';
import { BaselinesService } from '../baselines.service.js';
import { FinanceService } from '../finance.service.js';
import { MilestonesService } from '../milestones.service.js';
import { ProjectsService } from '../projects.service.js';
import { RisksService } from '../risks.service.js';
import { TeamService } from '../team.service.js';

loadEnv();
const pool = createPool(requireEnv('PROJECTS_DATABASE_URL'));
const projects = new ProjectsService(pool);
const team = new TeamService(pool, projects);
const milestones = new MilestonesService(pool, projects);
const baselines = new BaselinesService(pool, projects);
const finance = new FinanceService(pool, projects);
const risks = new RisksService(pool, projects);

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
  console.log('Proyectos de demostración listos: DEMO-001 a DEMO-004');
} finally {
  await pool.end();
}
