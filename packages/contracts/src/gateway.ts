import { z } from 'zod';
import { errorResponse, errors, healthReport, type RouteContract } from './common.js';
import { healthRoutes } from './health.js';
import { identityRoutes, sessionUser } from './identity.js';
import { platformRoutes } from './platform.js';
import { projectsRoutes } from './projects.js';

export const publicSession = z.object({ user: sessionUser, expiresAt: z.iso.datetime() });
export const publicLoginBody = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) });
export const publicPasswordBody = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024).describe('Entre 12 y 128 caracteres y distinta de la actual.'),
});
export const systemStatus = z.object({
  status: z.enum(['ok', 'degraded']),
  services: z.array(z.object({
    service: z.string(),
    status: z.enum(['ok', 'degraded', 'unreachable']),
    database: z.enum(['ok', 'down']).optional(),
  })),
});

const identityDown = { description: 'El servicio de identidad no respondió (`identity_unavailable`).', schema: errorResponse };

// Routes the gateway implements itself.
export const gatewayOwnRoutes: RouteContract[] = [
  { method: 'get', path: '/health', summary: 'Estado del gateway', tag: 'Estado', auth: 'none',
    responses: { 200: { description: 'Estado actual.', schema: healthReport } } },
  { method: 'get', path: '/api/v1/status', summary: 'Estado agregado de los servicios', tag: 'Estado', auth: 'none',
    responses: { 200: { description: 'Estado de cada servicio.', schema: systemStatus } } },
  { method: 'post', path: '/api/v1/session', summary: 'Iniciar sesión', tag: 'Sesión', auth: 'none',
    body: publicLoginBody,
    responses: {
      200: { description: 'Sesión iniciada. El token viaja solo en la cookie `phs_session` (HttpOnly, SameSite=Strict).', schema: publicSession },
      400: errors.invalidRequest,
      401: { description: 'Credenciales inválidas o cuenta bloqueada (`invalid_credentials`).', schema: errorResponse },
      403: { description: 'Origen no permitido (`origin_not_allowed`).', schema: errorResponse },
      502: identityDown,
    } },
  { method: 'get', path: '/api/v1/session', summary: 'Sesión actual', tag: 'Sesión', auth: 'session',
    responses: { 200: { description: 'Usuario, roles y vencimiento.', schema: publicSession }, 401: errors.unauthenticated } },
  { method: 'delete', path: '/api/v1/session', summary: 'Cerrar sesión', tag: 'Sesión', auth: 'none',
    responses: { 204: { description: 'Sesión revocada y cookie eliminada. Responde igual si no había sesión.' } } },
  { method: 'post', path: '/api/v1/session/password', summary: 'Cambiar la contraseña propia', tag: 'Sesión', auth: 'session',
    body: publicPasswordBody,
    responses: {
      204: { description: 'Contraseña cambiada.' },
      400: { description: 'Datos inválidos (`invalid_request`) o contraseña no aceptada (`weak_password`).', schema: errorResponse },
      401: { description: 'Sin sesión (`authentication_required`) o contraseña actual incorrecta (`invalid_current_password`).', schema: errorResponse },
      502: identityDown,
    } },
];

// Proxied routes add the gateway's own failure modes to what the service documents.
function proxied(routes: RouteContract[], select: (path: string) => boolean, prefix = '/api/v1'): RouteContract[] {
  return routes.filter((route) => select(route.path)).map((route) => ({
    ...route,
    path: `${prefix}${route.path}`,
    responses: {
      ...route.responses,
      401: errors.unauthenticated,
      403: { description: 'Sin permiso (`forbidden`), contraseña temporal sin cambiar (`password_change_required`) u origen no permitido (`origin_not_allowed`).', schema: errorResponse },
      502: identityDown,
    },
  }));
}

// Everything the browser can call: the gateway's own routes plus what it forwards to the services.
export const publicRoutes: RouteContract[] = [
  ...gatewayOwnRoutes.filter((route) => route.path !== '/health'),
  ...proxied(identityRoutes, (path) => path.startsWith('/admin/')),
  ...proxied(platformRoutes, (path) => path.startsWith('/evidence') || path.startsWith('/notifications')),
  ...proxied(healthRoutes, (path) => path.startsWith('/assessments/')),
  // Events and actions of the Health service are published under /governance.
  ...proxied(healthRoutes, (path) => !path.startsWith('/assessments/') && path !== '/health', '/api/v1/governance'),
  ...proxied(projectsRoutes, (path) => ['/projects', '/catalog/', '/clients', '/people'].some((prefix) => path.startsWith(prefix))),
];
