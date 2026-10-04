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
  revision: z.number().int().describe('Versión de la ficha. Se envía como expectedRevision al editar.'),
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
  startsOn: date.optional(),
  endsOn: date.optional(),
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
