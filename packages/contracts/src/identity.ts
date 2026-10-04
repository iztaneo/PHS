import { z } from 'zod';
import { errorResponse, errors, healthReport, membership, practiceRole, text, type RouteContract } from './common.js';

export const sessionUser = z.object({
  id: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  mustChangePassword: z.boolean().describe('La contraseña es temporal y debe cambiarse antes de operar.'),
  isAdmin: z.boolean(),
  memberships: z.array(membership),
});
export const sessionInfo = z.object({ sessionId: z.uuid(), expiresAt: z.iso.datetime(), user: sessionUser });
export const newSession = sessionInfo.extend({
  token: z.string().describe('Token de sesión. Solo viaja entre Identidad y el gateway; nunca llega al navegador en un cuerpo.'),
});

export const loginBody = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
  ipAddress: z.string().max(64).optional(),
  userAgent: z.string().max(512).optional(),
});
export const tokenBody = z.object({ token: z.string().min(1).max(256) });
export const passwordBody = tokenBody.extend({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024).describe('Entre 12 y 128 caracteres y distinta de la actual.'),
});

export const adminUser = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  active: z.boolean(),
  isAdmin: z.boolean(),
  memberships: z.array(membership),
});
export const practice = z.object({ id: z.uuid(), code: z.string(), name: z.string(), timezone: z.string() });
export const responsibilities = z.object({
  projectsAsPm: z.number().int(),
  projectsAsLead: z.number().int(),
  projectsAsTechnicalOwner: z.number().int(),
}).describe('Proyectos abiertos que necesitan nuevo responsable al deshabilitar al usuario.');

export const createUserBody = z.object({
  email: text(320).regex(/^[^\s@]+@[^\s@]+$/),
  displayName: text(200),
  isAdmin: z.boolean().default(false),
});
export const updateUserBody = z.object({
  displayName: text(200).optional(),
  active: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});
export const createPracticeBody = z.object({
  code: text(20),
  name: text(200),
  timezone: text(64).default('America/Mexico_City'),
});
export const membershipBody = z.object({
  userId: z.uuid(),
  practiceId: z.uuid(),
  role: practiceRole,
  granted: z.boolean().describe('true asigna el rol; false lo retira.'),
});
export const createdUser = z.object({
  user: adminUser,
  temporaryPassword: z.string().describe('Se entrega una sola vez; no puede consultarse después.'),
});
export const updatedUser = z.object({ user: adminUser, responsibilities: responsibilities.optional() });
export const temporaryPassword = z.object({ temporaryPassword: z.string() });

const userId = { id: z.uuid() };
const conflict = (codes: string) => ({ description: `Conflicto (${codes}).`, schema: errorResponse });
const adminErrors = { 401: errors.unauthenticated, 403: errors.forbidden };

// Internal API of the Identity service. Every route except /health requires the gateway signature.
export const identityRoutes: RouteContract[] = [
  { method: 'get', path: '/health', summary: 'Estado del servicio y de su base de datos', tag: 'Estado', auth: 'none',
    responses: { 200: { description: 'Estado actual.', schema: healthReport } } },
  { method: 'post', path: '/sessions', summary: 'Iniciar sesión con correo y contraseña', tag: 'Sesión', auth: 'internal',
    body: loginBody,
    responses: {
      201: { description: 'Sesión creada.', schema: newSession },
      400: errors.invalidRequest,
      401: { description: 'Credenciales inválidas, usuario deshabilitado o cuenta bloqueada (`invalid_credentials`). La respuesta no distingue el motivo.', schema: errorResponse },
    } },
  { method: 'post', path: '/sessions/introspect', summary: 'Validar un token de sesión', tag: 'Sesión', auth: 'internal',
    body: tokenBody,
    responses: {
      200: { description: 'Sesión vigente.', schema: sessionInfo },
      400: errors.invalidRequest,
      401: { description: 'Sesión inexistente, revocada, vencida o inactiva (`invalid_session`).', schema: errorResponse },
    } },
  { method: 'post', path: '/sessions/revoke', summary: 'Cerrar una sesión', tag: 'Sesión', auth: 'internal',
    body: tokenBody,
    responses: { 204: { description: 'Sesión revocada, o ya no existía.' }, 400: errors.invalidRequest } },
  { method: 'post', path: '/password', summary: 'Cambiar la contraseña propia', tag: 'Sesión', auth: 'internal',
    body: passwordBody,
    responses: {
      204: { description: 'Contraseña cambiada; las demás sesiones del usuario quedan revocadas.' },
      400: { description: 'Datos inválidos (`invalid_request`) o contraseña nueva no aceptada (`weak_password`).', schema: errorResponse },
      401: { description: 'Sesión inválida (`invalid_session`) o contraseña actual incorrecta (`invalid_current_password`).', schema: errorResponse },
    } },
  { method: 'get', path: '/admin/users', summary: 'Listar usuarios con sus roles', tag: 'Administración', auth: 'admin',
    responses: { 200: { description: 'Usuarios.', schema: z.array(adminUser) }, ...adminErrors } },
  { method: 'post', path: '/admin/users', summary: 'Crear usuario con contraseña temporal', tag: 'Administración', auth: 'admin',
    body: createUserBody,
    responses: { 201: { description: 'Usuario creado.', schema: createdUser }, 400: errors.invalidRequest, ...adminErrors, 409: conflict('`email_taken`') } },
  { method: 'patch', path: '/admin/users/:id', summary: 'Cambiar nombre, estado o capacidad de administrador', tag: 'Administración', auth: 'admin',
    params: userId, body: updateUserBody,
    responses: {
      200: { description: 'Usuario actualizado. Al deshabilitarlo se revocan sus sesiones.', schema: updatedUser },
      400: errors.invalidRequest, ...adminErrors, 404: errors.notFound,
      409: conflict('`last_admin`: debe quedar un administrador activo'),
    } },
  { method: 'post', path: '/admin/users/:id/reset-password', summary: 'Restablecer contraseña con un valor temporal', tag: 'Administración', auth: 'admin',
    params: userId,
    responses: { 201: { description: 'Contraseña temporal nueva; se revocan las sesiones del usuario.', schema: temporaryPassword }, 400: errors.invalidRequest, ...adminErrors, 404: errors.notFound } },
  { method: 'get', path: '/admin/practices', summary: 'Listar prácticas', tag: 'Administración', auth: 'admin',
    responses: { 200: { description: 'Prácticas.', schema: z.array(practice) }, ...adminErrors } },
  { method: 'post', path: '/admin/practices', summary: 'Crear práctica', tag: 'Administración', auth: 'admin',
    body: createPracticeBody,
    responses: {
      201: { description: 'Práctica creada.', schema: practice },
      400: { description: 'Datos inválidos (`invalid_request`) o zona horaria desconocida (`invalid_timezone`).', schema: errorResponse },
      ...adminErrors, 409: conflict('`code_taken`'),
    } },
  { method: 'put', path: '/admin/memberships', summary: 'Asignar o retirar un rol de práctica', tag: 'Administración', auth: 'admin',
    body: membershipBody,
    responses: { 200: { description: 'Usuario con sus roles resultantes. Repetir la operación no cambia nada.', schema: adminUser }, 400: errors.invalidRequest, ...adminErrors, 404: errors.notFound } },
];
