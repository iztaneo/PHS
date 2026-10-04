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
