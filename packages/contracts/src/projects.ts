import { z } from 'zod';
import {
  conflictResponse, errorResponse, errors, healthReport, idempotencyKey, practiceRole, text, type RouteContract,
} from './common.js';

export const projectCapabilities = z.object({
  view: z.boolean(),
  editOperation: z.boolean().describe('Editar la ficha, hitos, riesgos, economía y renovaciones.'),
  proposeAndReview: z.boolean().describe('Proponer cambios y enviar revisiones.'),
  decide: z.boolean().describe('Aprobar cambios y validar revisiones; también reasignar PM y líder.'),
  seeFinancials: z.boolean(),
}).describe('Lo que el usuario puede hacer en este proyecto según D05.');

export const projectStatus = z.enum(['planned', 'active', 'paused', 'renewing', 'closed']);
const date = z.iso.date().describe('Fecha de negocio, AAAA-MM-DD.');
const person = z.object({ id: z.uuid(), displayName: z.string() });

export const projectSummary = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: projectStatus,
  justificationRequired: z.boolean().describe('true: lleva un mes o más pausado o cerrado sin justificar; el PM debe describir la situación antes de editar (D08).'),
  practiceId: z.uuid(),
  practiceName: z.string(),
  clientId: z.uuid(),
  clientName: z.string(),
  serviceTypeCode: z.string(),
  serviceTypeName: z.string(),
  pmName: z.string(),
  startsOn: date,
  endsOn: date,
  capabilities: projectCapabilities,
});

export const projectDetail = projectSummary.extend({
  description: z.string(),
  pm: person,
  lead: person,
  technicalOwner: person,
  sponsor: person.nullable(),
  currency: z.string(),
  timezone: z.string(),
  clientContact: z.string().describe('Contacto del cliente para este proyecto.'),
  escalationNotes: z.string().describe('Ruta de escalación de este proyecto.'),
  revision: z.number().int().describe('Versión del proyecto. Aumenta al cambiar la ficha, el equipo, los hitos o la línea base.'),
  hasBaseline: z.boolean().describe('false: el siguiente paso es definir la línea base.'),
});

export const projectPage = z.object({
  items: z.array(projectSummary),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const listProjectsQuery = z.object({
  q: z.string().trim().max(100).optional().describe('Busca en nombre y código.'),
  clientId: z.uuid().optional(),
  serviceTypeCode: z.string().max(40).optional(),
  status: projectStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createProjectBody = z.object({
  practiceId: z.uuid(),
  code: text(40),
  name: text(200),
  description: z.string().trim().max(4000).default(''),
  clientName: text(200).describe('Se reutiliza el cliente existente con ese nombre o se crea uno nuevo.'),
  serviceTypeCode: text(40),
  pmId: z.uuid(),
  leadId: z.uuid(),
  technicalOwnerId: z.uuid(),
  sponsorId: z.uuid().nullable().default(null),
  clientContact: z.string().trim().max(500).default(''),
  escalationNotes: z.string().trim().max(2000).default(''),
  startsOn: date,
  endsOn: date,
  currency: z.string().regex(/^[A-Z]{3}$/).default('MXN'),
});

export const updateProjectBody = z.object({
  expectedRevision: z.number().int().min(1).describe('Revisión que el usuario estaba viendo al editar.'),
  name: text(200).optional(),
  description: z.string().trim().max(4000).optional(),
  serviceTypeCode: text(40).optional(),
  pmId: z.uuid().optional(),
  leadId: z.uuid().optional(),
  technicalOwnerId: z.uuid().optional(),
  sponsorId: z.uuid().nullable().optional(),
  clientContact: z.string().trim().max(500).optional(),
  escalationNotes: z.string().trim().max(2000).optional(),
  startsOn: date.optional(),
  endsOn: date.optional(),
});

// ---- Team (PHS-010)
export const memberRole = z.enum(['contributor', 'viewer']);
export const projectMember = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  active: z.boolean(),
  role: memberRole,
  allocationPct: z.number().min(0).max(100).nullable().describe('Porcentaje de asignación; null si no se ha definido.'),
});
export const putMemberBody = z.object({
  role: memberRole,
  allocationPct: z.number().min(0).max(100).nullable().default(null),
});
export const removeMemberQuery = z.object({
  keepResponsibilities: z.enum(['true', 'false']).default('false')
    .describe('true confirma que el integrante conserva sus responsabilidades abiertas y, por ellas, el acceso de consulta.'),
});

// ---- Milestones (PHS-015)
export const milestoneStatus = z.enum(['pending', 'in_progress', 'completed', 'rescheduled', 'cancelled']);
export const milestone = z.object({
  id: z.uuid(),
  title: z.string(),
  deliverable: z.string(),
  owner: person,
  dueOn: date.describe('Fecha operativa prevista.'),
  committedDueOn: date.nullable().describe('Fecha comprometida en la línea base vigente; null si el hito no forma parte de ella.'),
  critical: z.boolean(),
  status: milestoneStatus,
  progressPct: z.number().min(0).max(100).nullable(),
  completedOn: date.nullable(),
  completionNote: z.string().nullable(),
  overdue: z.boolean().describe('Abierto y con fecha operativa anterior a hoy en la zona horaria del proyecto.'),
  revision: z.number().int(),
  canUpdate: z.boolean().describe('El usuario puede cambiar estado y avance: PM, líder o responsable del hito.'),
});
export const createMilestoneBody = z.object({
  title: text(200),
  deliverable: z.string().trim().max(2000).default(''),
  ownerId: z.uuid(),
  dueOn: date,
  critical: z.boolean().default(false),
});
export const updateMilestoneBody = z.object({
  expectedRevision: z.number().int().min(1),
  title: text(200).optional(),
  deliverable: z.string().trim().max(2000).optional(),
  ownerId: z.uuid().optional(),
  critical: z.boolean().optional(),
  progressPct: z.number().min(0).max(100).nullable().optional(),
  dueOn: date.optional(),
  reason: text(1000).optional().describe('Obligatoria al reprogramar un hito comprometido en la línea base.'),
});
export const transitionMilestoneBody = z.object({
  expectedRevision: z.number().int().min(1),
  to: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  note: text(2000).optional().describe('Obligatoria al completar, cancelar o reabrir.'),
  completedOn: date.optional().describe('Fecha real de cumplimiento; por defecto hoy en la zona del proyecto.'),
});

// ---- Baselines (PHS-011). These two shapes are the contract of the JSONB snapshots.
const amount = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/).describe('Decimal no negativo como texto, hasta dos decimales.');
export const milestoneSnapshot = z.object({
  id: z.uuid(), title: z.string(), deliverable: z.string(), due_on: date, owner_id: z.uuid(), owner_name: z.string(),
  critical: z.boolean(), weight: z.number(),
});
export const teamSnapshot = z.object({
  user_id: z.uuid(), display_name: z.string(),
  role: z.enum(['pm', 'lead', 'technical_owner', 'sponsor', 'contributor', 'viewer']),
  allocation_pct: z.number().nullable(),
});
export const baseline = z.object({
  id: z.uuid(),
  version: z.number().int(),
  current: z.boolean(),
  startsOn: date,
  endsOn: date,
  scope: z.string(),
  budget: z.string().nullable().describe('null: desconocido, o no visible para este usuario.'),
  effortHours: z.string().nullable(),
  financialsHidden: z.boolean().describe('true: el usuario no puede ver importes (D05).'),
  currency: z.string(),
  milestones: z.array(milestoneSnapshot),
  team: z.array(teamSnapshot),
  reason: z.string(),
  createdBy: person,
  createdAt: z.iso.datetime({ offset: true }),
});
export const publishBaselineBody = z.object({
  expectedRevision: z.number().int().min(1),
  scope: text(4000),
  budget: amount.nullable().default(null).describe('null si aún no se conoce; no se confunde con cero.'),
  effortHours: amount.nullable().default(null),
  reason: text(1000).default('Línea base inicial'),
});

// ---- Changes (PHS-018, PHS-019). `changeImpact` is the contract of the request; `storedImpact` is the
// contract of the JSONB kept with the proposal, with the values before and proposed.
const signedAmount = z.string().regex(/^-?\d{1,16}(\.\d{1,2})?$/).describe('Decimal con signo como texto; negativo reduce.');
export const changeType = z.enum(['client', 'internal', 'regulatory', 'technical']);
export const changeImpact = z.object({
  endsOn: date.optional().describe('Nueva fecha de fin del proyecto.'),
  budgetDelta: signedAmount.optional().describe('Aumento o reducción del presupuesto.'),
  effortHoursDelta: signedAmount.optional(),
  scope: text(4000).optional().describe('Nuevo texto de alcance.'),
  milestones: z.array(z.object({ id: z.uuid(), dueOn: date })).max(100).default([])
    .describe('Hitos comprometidos cuya fecha cambia. Solo se mueven los que se listan aquí.'),
});
const beforeAfter = z.object({ before: z.string().nullable(), proposed: z.string().nullable() });
export const storedImpact = z.object({
  baselineVersion: z.number().int().describe('Línea base de referencia de la propuesta.'),
  endsOn: beforeAfter.optional(),
  budget: beforeAfter.extend({ delta: z.string() }).optional(),
  effortHours: beforeAfter.extend({ delta: z.string() }).optional(),
  scope: beforeAfter.optional(),
  milestones: z.array(z.object({ id: z.uuid(), title: z.string(), before: date, proposed: date })),
  correctsId: z.uuid().nullable(),
});
export const changeDecision = z.object({
  decision: z.enum(['approved', 'rejected']),
  decidedBy: person,
  decidedAt: z.iso.datetime({ offset: true }),
  comment: z.string(),
  baselineVersion: z.number().int().nullable().describe('Versión de línea base que originó la aprobación.'),
});
export const change = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  changeType,
  proposedBy: person,
  proposedAt: z.iso.datetime({ offset: true }),
  impact: storedImpact,
  financialsHidden: z.boolean().describe('true: los importes del impacto no son visibles para este usuario.'),
  decision: changeDecision.nullable().describe('null: pendiente de decisión.'),
  canDecide: z.boolean(),
});
export const createChangeBody = z.object({
  title: text(200),
  description: text(4000).describe('Motivo del cambio.'),
  changeType,
  impact: changeImpact,
  correctsId: z.uuid().nullable().default(null).describe('Propuesta anterior que esta corrige; una propuesta enviada no se edita.'),
});
export const decideChangeBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: text(2000),
});

// ---- Status with reasons (PHS-014, D08)
export const statusLogEntry = z.object({
  kind: z.enum(['transition', 'justification']),
  fromStatus: projectStatus.nullable(),
  toStatus: projectStatus,
  reason: z.string(),
  recordedBy: person,
  recordedAt: z.iso.datetime({ offset: true }),
});
export const projectStatusView = z.object({
  status: projectStatus,
  since: z.iso.datetime({ offset: true }).nullable().describe('Cuándo entró al estado actual; null si nunca cambió.'),
  daysInStatus: z.number().int().nullable(),
  allowed: z.array(projectStatus).describe('Estados a los que este usuario puede pasar el proyecto.'),
  justificationRequired: z.boolean(),
  justificationAfterDays: z.number().int(),
  open: z.object({ milestones: z.number().int(), risks: z.number().int(), renewals: z.number().int(), tasks: z.number().int() })
    .describe('Elementos abiertos. Pausar o cerrar no los elimina.'),
  history: z.array(statusLogEntry),
});
export const changeStatusBody = z.object({
  expectedRevision: z.number().int().min(1),
  to: projectStatus,
  reason: text(2000),
});
export const justifyStatusBody = z.object({ reason: text(2000) });

// ---- Renewals (PHS-013)
export const renewal = z.object({
  id: z.uuid(),
  dueOn: date,
  owner: person,
  status: z.enum(['pending', 'renewed', 'cancelled']),
  notes: z.string(),
  outcomeNote: z.string().nullable(),
  closedAt: z.iso.datetime({ offset: true }).nullable(),
  daysToDue: z.number().int().describe('Días hasta la fecha, en la zona del proyecto; negativo si ya pasó.'),
  overdue: z.boolean(),
  revision: z.number().int(),
  canUpdate: z.boolean(),
});
export const createRenewalBody = z.object({ dueOn: date, ownerId: z.uuid(), notes: z.string().trim().max(2000).default('') });
export const renewalOutcomeBody = z.object({
  expectedRevision: z.number().int().min(1),
  outcome: z.enum(['renewed', 'cancelled']),
  comment: text(2000),
});

// ---- Economy (PHS-012)
export const financialObservation = z.object({
  id: z.uuid(),
  effectiveOn: date,
  totalCost: z.string().describe('Costo acumulado a la fecha efectiva, en la moneda del proyecto.'),
  totalEffortHours: z.string().nullable().describe('Horas acumuladas; null si no se registraron.'),
  source: z.string().describe('Origen del dato, por ejemplo el sistema o reporte del que se tomó.'),
  recordedBy: person,
  recordedAt: z.iso.datetime({ offset: true }),
  supersedesId: z.uuid().nullable().describe('Observación que esta corrige.'),
  superseded: z.boolean().describe('true: otra observación la corrigió; se conserva como historia.'),
});
export const financeSummary = z.object({
  currency: z.string(),
  asOf: date,
  budget: z.string().nullable().describe('Presupuesto de la línea base vigente; null si es desconocido o no hay línea base.'),
  effortBudgetHours: z.string().nullable(),
  current: financialObservation.nullable().describe('Observación aplicable a la fecha consultada. No se suman acumulados.'),
  actualProgress: z.string().nullable().describe('Avance real por peso de hitos, en porcentaje.'),
  expectedCost: z.string().nullable().describe('Costo que justifica el avance logrado: presupuesto × avance real.'),
  deviation: z.string().nullable().describe('Desviación financiera en porcentaje del presupuesto; positiva si se gasta por delante del avance.'),
  gate: z.boolean().describe('true si la desviación supera 3% (regla v1).'),
  missing: z.array(z.enum(['budget', 'cost', 'progress'])).describe('Datos que faltan para calcular la desviación.'),
  ruleSetVersion: z.string(),
  observations: z.array(financialObservation).describe('Historial completo, de la más reciente a la más antigua.'),
});
export const financeQuery = z.object({ asOf: date.optional().describe('Por defecto, hoy en la zona horaria del proyecto.') });
export const createObservationBody = z.object({
  effectiveOn: date,
  totalCost: amount,
  totalEffortHours: amount.nullable().default(null),
  source: text(200),
  supersedesId: z.uuid().nullable().default(null).describe('Para corregir una observación anterior, que se conserva.'),
});

// ---- Risks (PHS-016)
export const riskType = z.enum(['project', 'client']);
export const riskCategory = z.enum(['schedule', 'financial', 'client', 'team', 'technical', 'supplier', 'scope']);
export const riskStatus = z.enum(['open', 'mitigating', 'mitigated', 'materialized', 'closed']);
const level = z.number().int().min(1).max(3).describe('1 baja, 2 media, 3 alta.');
export const risk = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  riskType,
  category: riskCategory,
  probability: level,
  impact: level,
  severity: z.number().int().describe('Probabilidad × impacto, de 1 a 9. Crítico desde 6.'),
  owner: person,
  mitigationDueOn: date,
  strategy: z.string(),
  status: riskStatus,
  overdue: z.boolean().describe('Abierto o en mitigación con fecha de mitigación anterior a hoy en la zona del proyecto.'),
  revision: z.number().int(),
  canUpdate: z.boolean().describe('El usuario puede registrar seguimiento: PM, líder o responsable del riesgo.'),
});
export const createRiskBody = z.object({
  title: text(200),
  description: z.string().trim().max(4000).default(''),
  riskType,
  category: riskCategory,
  probability: level,
  impact: level,
  ownerId: z.uuid(),
  mitigationDueOn: date,
  strategy: z.string().trim().max(4000).default(''),
});
export const followUpRiskBody = z.object({
  expectedRevision: z.number().int().min(1),
  comment: text(2000).describe('Obligatorio en todo seguimiento; queda en el historial.'),
  probability: level.optional(),
  impact: level.optional(),
  mitigationDueOn: date.optional(),
  strategy: z.string().trim().max(4000).optional(),
  ownerId: z.uuid().optional().describe('Solo PM o líder pueden reasignar.'),
  status: riskStatus.optional(),
});
export const riskHistoryEntry = z.object({
  occurredAt: z.iso.datetime({ offset: true }),
  actor: person.nullable(),
  note: z.string(),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
});

export const clientSummary = z.object({ id: z.uuid(), name: z.string() });
export const practicePerson = z.object({
  id: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  roles: z.array(practiceRole).describe('Roles del usuario en la práctica consultada.'),
});

export const serviceType = z.object({ code: z.string(), name: z.string(), active: z.boolean() });
export const createServiceTypeBody = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/),
  name: text(120),
});
export const updateServiceTypeBody = z.object({
  active: z.boolean().describe('false lo oculta para nuevos proyectos; los existentes lo conservan.'),
});

const projectRules = 'Reglas de negocio no cumplidas: `invalid_dates`, `service_type_inactive`, `pm_not_eligible`, `lead_not_eligible`, `responsible_not_enabled`; o datos mal formados (`invalid_request`).';

// Internal API of the Projects service. Every route except /health requires an authenticated user.
export const projectsRoutes: RouteContract[] = [
  { method: 'get', path: '/health', summary: 'Estado del servicio y de su base de datos', tag: 'Estado', auth: 'none',
    responses: { 200: { description: 'Estado actual.', schema: healthReport } } },
  { method: 'get', path: '/projects', summary: 'Proyectos al alcance del usuario, con búsqueda, filtros y paginación', tag: 'Proyectos', auth: 'session',
    query: listProjectsQuery.shape,
    responses: { 200: { description: 'Página de proyectos que el usuario puede consultar.', schema: projectPage }, 400: errors.invalidRequest, 401: errors.unauthenticated } },
  { method: 'post', path: '/projects', summary: 'Crear proyecto', tag: 'Proyectos', auth: 'session',
    headers: { 'Idempotency-Key': idempotencyKey }, body: createProjectBody,
    responses: {
      201: { description: 'Proyecto creado. Repetir la petición con la misma clave devuelve este mismo resultado sin crear otro.', schema: projectDetail },
      400: { description: `${projectRules} También \`idempotency_key_required\`.`, schema: errorResponse },
      401: errors.unauthenticated,
      403: { description: 'El usuario no puede crear proyectos en esa práctica (`practice_not_authorized`).', schema: errorResponse },
      409: { description: 'Código ya usado (`code_taken`) o clave de idempotencia reutilizada con otro contenido (`idempotency_key_reused`).', schema: errorResponse },
    } },
  { method: 'get', path: '/projects/:id', summary: 'Ficha de un proyecto al alcance del usuario', tag: 'Proyectos', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Ficha.', schema: projectDetail }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'patch', path: '/projects/:id', summary: 'Editar la ficha de un proyecto', tag: 'Proyectos', auth: 'session',
    params: { id: z.uuid() }, body: updateProjectBody,
    responses: {
      200: { description: 'Ficha actualizada; la revisión aumenta en uno.', schema: projectDetail },
      400: { description: projectRules, schema: errorResponse },
      401: errors.unauthenticated,
      403: { description: 'Sin permiso para editar, o para reasignar PM o líder (`forbidden`).', schema: errorResponse },
      404: errors.notFound,
      409: { description: 'Otro usuario modificó la ficha (`revision_conflict`, con `currentRevision`), o las fechas pertenecen a una línea base vigente y deben cambiarse mediante un cambio aprobado (`baseline_change_required`).', schema: conflictResponse },
    } },
  { method: 'get', path: '/projects/:id/members', summary: 'Equipo del proyecto', tag: 'Equipo', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Integrantes.', schema: z.array(projectMember) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'put', path: '/projects/:id/members/:userId', summary: 'Agregar un integrante o cambiar su función y asignación', tag: 'Equipo', auth: 'session',
    params: { id: z.uuid(), userId: z.uuid() }, body: putMemberBody,
    responses: {
      200: { description: 'Equipo resultante. Repetir la operación no crea un segundo integrante.', schema: z.array(projectMember) },
      400: { description: 'Datos inválidos (`invalid_request`) o usuario inexistente o deshabilitado (`responsible_not_enabled`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
    } },
  { method: 'delete', path: '/projects/:id/members/:userId', summary: 'Quitar un integrante', tag: 'Equipo', auth: 'session',
    params: { id: z.uuid(), userId: z.uuid() }, query: removeMemberQuery.shape,
    responses: {
      200: { description: 'Equipo resultante.', schema: z.array(projectMember) },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'El integrante tiene responsabilidades abiertas (`member_has_responsibilities`). Reasígnelas o repita con `keepResponsibilities=true`.', schema: conflictResponse },
    } },
  { method: 'get', path: '/projects/:id/milestones', summary: 'Hitos del proyecto', tag: 'Hitos', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Hitos ordenados por fecha.', schema: z.array(milestone) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/projects/:id/milestones', summary: 'Registrar hito', tag: 'Hitos', auth: 'session',
    params: { id: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: createMilestoneBody,
    responses: {
      201: { description: 'Hito registrado.', schema: milestone },
      400: { description: 'Datos inválidos, `idempotency_key_required` o responsable no habilitado (`responsible_not_enabled`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Clave de idempotencia reutilizada (`idempotency_key_reused`).', schema: errorResponse },
    } },
  { method: 'patch', path: '/projects/:id/milestones/:milestoneId', summary: 'Editar o reprogramar un hito', tag: 'Hitos', auth: 'session',
    params: { id: z.uuid(), milestoneId: z.uuid() }, body: updateMilestoneBody,
    responses: {
      200: { description: 'Hito actualizado. Cambiar la fecha de un hito comprometido lo deja como reprogramado y conserva la fecha comprometida.', schema: milestone },
      400: { description: 'Datos inválidos, `responsible_not_enabled` o falta el motivo de la reprogramación (`reason_required`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Otro usuario lo modificó (`revision_conflict`) o el hito está cerrado (`invalid_transition`).', schema: conflictResponse },
    } },
  { method: 'post', path: '/projects/:id/milestones/:milestoneId/transition', summary: 'Cambiar el estado de un hito', tag: 'Hitos', auth: 'session',
    params: { id: z.uuid(), milestoneId: z.uuid() }, body: transitionMilestoneBody,
    responses: {
      200: { description: 'Hito con su nuevo estado.', schema: milestone },
      400: { description: 'Datos inválidos, falta el comentario (`note_required`) o fecha de cumplimiento futura (`invalid_completion_date`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Otro usuario lo modificó (`revision_conflict`) o la transición no está permitida (`invalid_transition`).', schema: conflictResponse },
    } },
  { method: 'get', path: '/projects/:id/baselines', summary: 'Líneas base del proyecto', tag: 'Línea base', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Versiones, de la más reciente a la más antigua.', schema: z.array(baseline) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/projects/:id/baselines', summary: 'Publicar la línea base inicial', tag: 'Línea base', auth: 'session',
    params: { id: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: publishBaselineBody,
    responses: {
      201: { description: 'Versión 1 publicada con el detalle completo de hitos y equipo. Es inmutable.', schema: baseline },
      400: { description: 'Datos inválidos o `idempotency_key_required`.', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Ya existe una línea base (`baseline_exists`), otro usuario modificó el proyecto (`revision_conflict`) o clave reutilizada (`idempotency_key_reused`).', schema: conflictResponse },
    } },
  { method: 'get', path: '/projects/:id/status', summary: 'Estado del proyecto, historial y elementos abiertos', tag: 'Estado del proyecto', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Estado con sus motivos.', schema: projectStatusView }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/projects/:id/status', summary: 'Iniciar, pausar, reanudar, cerrar o reabrir un proyecto', tag: 'Estado del proyecto', auth: 'session',
    params: { id: z.uuid() }, body: changeStatusBody,
    responses: {
      200: { description: 'Proyecto con su nuevo estado. Los elementos abiertos se conservan.', schema: projectDetail },
      400: errors.invalidRequest, 401: errors.unauthenticated,
      403: { description: 'Sin permiso; cerrar y reabrir corresponden al líder (`forbidden`).', schema: errorResponse },
      404: errors.notFound,
      409: { description: 'Transición no permitida (`invalid_transition`), otro usuario modificó el proyecto (`revision_conflict`) o falta la justificación (`status_justification_required`).', schema: conflictResponse },
    } },
  { method: 'post', path: '/projects/:id/status/justification', summary: 'Justificar que el proyecto siga pausado o cerrado', tag: 'Estado del proyecto', auth: 'session',
    params: { id: z.uuid() }, body: justifyStatusBody,
    responses: {
      200: { description: 'Justificación guardada; el proyecto vuelve a poder editarse.', schema: projectStatusView },
      400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'No hay justificación pendiente (`justification_not_required`).', schema: errorResponse },
    } },
  { method: 'get', path: '/projects/:id/renewals', summary: 'Renovaciones del proyecto', tag: 'Renovaciones', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Renovaciones, primero las pendientes.', schema: z.array(renewal) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/projects/:id/renewals', summary: 'Registrar una renovación', tag: 'Renovaciones', auth: 'session',
    params: { id: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: createRenewalBody,
    responses: {
      201: { description: 'Renovación pendiente. Registrar otro periodo no modifica las anteriores.', schema: renewal },
      400: { description: 'Datos inválidos, `idempotency_key_required` o `responsible_not_enabled`.', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: '`idempotency_key_reused` o `status_justification_required`.', schema: errorResponse },
    } },
  { method: 'post', path: '/projects/:id/renewals/:renewalId/outcome', summary: 'Renovar o cancelar una renovación', tag: 'Renovaciones', auth: 'session',
    params: { id: z.uuid(), renewalId: z.uuid() }, body: renewalOutcomeBody,
    responses: {
      200: { description: 'Resultado registrado con su comentario; la fecha original se conserva.', schema: renewal },
      400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Ya tenía resultado (`invalid_transition`) u otro usuario la modificó (`revision_conflict`).', schema: conflictResponse },
    } },
  { method: 'get', path: '/projects/:id/changes', summary: 'Cambios propuestos y sus decisiones', tag: 'Cambios', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Cambios, del más reciente al más antiguo.', schema: z.array(change) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/projects/:id/changes', summary: 'Proponer un cambio con impactos concretos', tag: 'Cambios', auth: 'session',
    params: { id: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: createChangeBody,
    responses: {
      201: { description: 'Propuesta registrada con los valores anteriores y propuestos. No altera la línea base.', schema: change },
      400: { description: 'Datos inválidos, `idempotency_key_required` o impacto no aplicable (`invalid_impact`): sin impactos, hito fuera de la línea base o ya cerrado, fecha anterior al inicio o importe resultante negativo.', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'El proyecto no tiene línea base (`baseline_required`) o clave reutilizada (`idempotency_key_reused`).', schema: errorResponse },
    } },
  { method: 'post', path: '/projects/:id/changes/:changeId/decision', summary: 'Aprobar o rechazar un cambio', tag: 'Cambios', auth: 'session',
    params: { id: z.uuid(), changeId: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: decideChangeBody,
    responses: {
      201: { description: 'Decisión registrada. Aprobar crea la línea base siguiente y mueve solo los compromisos listados; rechazar no cambia nada.', schema: change },
      400: { description: 'Datos inválidos, `idempotency_key_required` o impacto que ya no es aplicable (`invalid_impact`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'El cambio ya tiene decisión (`already_decided`), la línea base cambió desde la propuesta (`baseline_changed`) o clave reutilizada (`idempotency_key_reused`).', schema: errorResponse },
    } },
  { method: 'get', path: '/projects/:id/finance', summary: 'Economía del proyecto a una fecha', tag: 'Economía', auth: 'session',
    params: { id: z.uuid() }, query: financeQuery.shape,
    responses: {
      200: { description: 'Presupuesto, gasto aplicable, desviación calculada e historial.', schema: financeSummary },
      400: errors.invalidRequest, 401: errors.unauthenticated,
      403: { description: 'El usuario no puede ver datos económicos (`forbidden`).', schema: errorResponse },
      404: errors.notFound,
    } },
  { method: 'post', path: '/projects/:id/finance', summary: 'Registrar o corregir una observación económica', tag: 'Economía', auth: 'session',
    params: { id: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: createObservationBody,
    responses: {
      201: { description: 'Observación registrada. Una corrección conserva la observación anterior.', schema: financialObservation },
      400: { description: 'Datos inválidos, `idempotency_key_required` o fecha efectiva futura (`invalid_effective_date`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'La observación a corregir ya fue corregida (`already_superseded`) o clave reutilizada (`idempotency_key_reused`).', schema: errorResponse },
    } },
  { method: 'get', path: '/projects/:id/risks', summary: 'Riesgos del proyecto', tag: 'Riesgos', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Riesgos, primero los abiertos de mayor severidad.', schema: z.array(risk) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/projects/:id/risks', summary: 'Registrar riesgo', tag: 'Riesgos', auth: 'session',
    params: { id: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: createRiskBody,
    responses: {
      201: { description: 'Riesgo registrado en estado abierto.', schema: risk },
      400: { description: 'Datos inválidos o fuera de catálogo, `idempotency_key_required` o `responsible_not_enabled`.', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Clave de idempotencia reutilizada (`idempotency_key_reused`).', schema: errorResponse },
    } },
  { method: 'patch', path: '/projects/:id/risks/:riskId', summary: 'Registrar seguimiento de un riesgo', tag: 'Riesgos', auth: 'session',
    params: { id: z.uuid(), riskId: z.uuid() }, body: followUpRiskBody,
    responses: {
      200: { description: 'Riesgo actualizado; el comentario y los valores anteriores y nuevos quedan en el historial.', schema: risk },
      400: { description: 'Datos inválidos o `responsible_not_enabled`.', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Otro usuario lo modificó (`revision_conflict`) o el cambio de estado no está permitido (`invalid_transition`).', schema: conflictResponse },
    } },
  { method: 'get', path: '/projects/:id/risks/:riskId/history', summary: 'Historial de seguimiento de un riesgo', tag: 'Riesgos', auth: 'session',
    params: { id: z.uuid(), riskId: z.uuid() },
    responses: { 200: { description: 'Seguimientos, del más reciente al más antiguo.', schema: z.array(riskHistoryEntry) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'get', path: '/clients', summary: 'Clientes de los proyectos al alcance del usuario', tag: 'Proyectos', auth: 'session',
    responses: { 200: { description: 'Clientes para filtrar la lista.', schema: z.array(clientSummary) }, 401: errors.unauthenticated } },
  { method: 'get', path: '/people', summary: 'Usuarios activos que pueden nombrarse responsables en una práctica', tag: 'Proyectos', auth: 'session',
    query: { practiceId: z.uuid() },
    responses: {
      200: { description: 'Usuarios activos con sus roles en la práctica.', schema: z.array(practicePerson) },
      400: errors.invalidRequest, 401: errors.unauthenticated,
      403: { description: 'Solo PM o líder de la práctica (`forbidden`).', schema: errorResponse },
    } },
  { method: 'get', path: '/catalog/service-types', summary: 'Catálogo de tipos de servicio', tag: 'Catálogos', auth: 'session',
    responses: { 200: { description: 'Tipos activos e inactivos.', schema: z.array(serviceType) }, 401: errors.unauthenticated } },
  { method: 'post', path: '/catalog/service-types', summary: 'Agregar tipo de servicio', tag: 'Catálogos', auth: 'admin',
    body: createServiceTypeBody,
    responses: {
      201: { description: 'Tipo creado.', schema: serviceType }, 400: errors.invalidRequest, 401: errors.unauthenticated,
      403: errors.forbidden, 409: { description: 'Código o nombre ya usados (`code_taken`).', schema: errorResponse },
    } },
  { method: 'patch', path: '/catalog/service-types/:code', summary: 'Activar o desactivar un tipo de servicio', tag: 'Catálogos', auth: 'admin',
    params: { code: z.string() }, body: updateServiceTypeBody,
    responses: { 200: { description: 'Tipo actualizado.', schema: serviceType }, 400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound },
  },
];
