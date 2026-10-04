import { z } from 'zod';
import { errorResponse, errors, healthReport, text, type RouteContract } from './common.js';

export const projectCapabilities = z.object({
  view: z.boolean(),
  editOperation: z.boolean().describe('Editar hitos, riesgos, economía y renovaciones.'),
  proposeAndReview: z.boolean().describe('Proponer cambios y enviar revisiones.'),
  decide: z.boolean().describe('Aprobar cambios y validar revisiones.'),
  seeFinancials: z.boolean(),
}).describe('Lo que el usuario puede hacer en este proyecto según D05.');

export const projectSummary = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: z.enum(['planned', 'active', 'paused', 'renewing', 'closed']),
  practiceId: z.uuid(),
  practiceName: z.string(),
  clientName: z.string(),
  capabilities: projectCapabilities,
});

export const serviceType = z.object({ code: z.string(), name: z.string(), active: z.boolean() });
export const createServiceTypeBody = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/),
  name: text(120),
});
export const updateServiceTypeBody = z.object({
  active: z.boolean().describe('false lo oculta para nuevos proyectos; los existentes lo conservan.'),
});

// Internal API of the Projects service. Every route except /health requires an authenticated user.
export const projectsRoutes: RouteContract[] = [
  { method: 'get', path: '/health', summary: 'Estado del servicio y de su base de datos', tag: 'Estado', auth: 'none',
    responses: { 200: { description: 'Estado actual.', schema: healthReport } } },
  { method: 'get', path: '/projects', summary: 'Proyectos al alcance del usuario', tag: 'Proyectos', auth: 'session',
    responses: { 200: { description: 'Solo los proyectos que el usuario puede consultar.', schema: z.array(projectSummary) }, 401: errors.unauthenticated } },
  { method: 'get', path: '/projects/:id', summary: 'Un proyecto al alcance del usuario', tag: 'Proyectos', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Proyecto.', schema: projectSummary }, 401: errors.unauthenticated, 404: errors.notFound } },
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
