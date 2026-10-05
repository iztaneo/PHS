import { z } from 'zod';
import { errorResponse, errors, healthReport, text, type RouteContract } from './common.js';

const person = z.object({ id: z.uuid(), displayName: z.string() });
export const evidenceTargetKind = z.enum(['milestone', 'risk', 'change', 'review']);
export const evidenceTargetQuery = z.object({
  projectId: z.uuid(),
  kind: evidenceTargetKind,
  targetId: z.uuid().describe('Hito, riesgo o cambio del mismo proyecto.'),
});
export const evidence = z.object({
  id: z.uuid(),
  target: z.object({ kind: evidenceTargetKind, id: z.uuid() }),
  text: z.string().nullable(),
  file: z.object({ name: z.string(), mime: z.string(), sizeBytes: z.number().int() }).nullable(),
  uploadedBy: person,
  uploadedAt: z.iso.datetime({ offset: true }),
  addendum: z.boolean().describe('true: se agregó cuando el elemento ya estaba cerrado o decidido.'),
  withdrawn: z.object({ by: person, at: z.iso.datetime({ offset: true }), reason: z.string() }).nullable()
    .describe('Si fue retirada: el contenido ya no se entrega, queda el registro.'),
});
export const addEvidenceForm = evidenceTargetQuery.extend({
  text: z.string().max(4000).optional(),
  file: z.string().optional().describe('Archivo binario: PNG, JPEG, WebP, PDF, DOCX, XLSX o PPTX sin macros, hasta 10 MB.'),
});
export const withdrawEvidenceBody = z.object({ reason: text(1000) });

// ---- In-app notifications (PHS-034)
export const notification = z.object({
  id: z.uuid(),
  type: z.string().describe('Tipo del mensaje de origen, por ejemplo `event.opened` o `review.submitted`.'),
  state: z.enum(['actionable', 'attended', 'info']).describe('actionable: alguien debe actuar. attended: ya se atendió. info: no requiere acción.'),
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string(),
  project: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  owner: z.object({ id: z.uuid(), displayName: z.string() }).nullable().describe('Responsable de la acción, cuando la notificación viene de una alerta.'),
  dueOn: z.iso.date().nullable(),
  tab: z.enum(['alerts', 'reviews', 'changes']).describe('Pestaña del proyecto donde está el origen.'),
  sentAt: z.iso.datetime({ offset: true }),
  readAt: z.iso.datetime({ offset: true }).nullable(),
});
export const inbox = z.object({
  unread: z.number().int(),
  items: z.array(notification).describe('Primero lo accionable, por criticidad y plazo; al final lo ya atendido. Solo proyectos que el usuario puede consultar.'),
});

// ---- History and timeline (PHS-038)
export const historyCategory = z.enum(['project', 'milestone', 'risk', 'change', 'review', 'alert', 'action', 'evaluation', 'finance', 'renewal', 'evidence']);
export const historyQuery = z.object({
  projectId: z.uuid(),
  category: historyCategory.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional().describe('Incluye ese día completo.'),
  cursor: z.string().max(200).optional().describe('`nextCursor` de la página anterior.'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const historyEntry = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime({ offset: true }),
  category: historyCategory,
  action: z.string().describe('Acción registrada, por ejemplo `milestone.completed`.'),
  title: z.string(),
  detail: z.string().nullable().describe('Motivo, comentario o valores pertinentes. Las cifras económicas solo para quien puede verlas.'),
  actor: z.string().nullable().describe('null: lo hizo el sistema.'),
});
export const historyPage = z.object({
  items: z.array(historyEntry).describe('Del más reciente al más antiguo, en orden estable.'),
  nextCursor: z.string().nullable().describe('null: no hay más.'),
});
export const timelineQuery = z.object({ projectId: z.uuid() });
const timelineItem = z.object({
  kind: z.enum(['milestone', 'risk', 'action', 'renewal', 'review', 'project_end', 'baseline', 'change', 'status']),
  title: z.string(), date: z.iso.date(), critical: z.boolean(),
  tab: z.enum(['card', 'milestones', 'risks', 'alerts', 'reviews', 'changes', 'baseline']).describe('Pestaña del proyecto donde está.'),
});
export const timeline = z.object({
  today: z.iso.date(),
  horizon: z.object({
    until: z.iso.date(), cycles: z.number().int(), cadence: z.enum(['weekly', 'fortnightly', 'monthly']),
    assumed: z.boolean().describe('true: el proyecto no tiene ciclo y se usaron dos quincenas.'),
  }),
  past: z.array(timelineItem).describe('Lo ocurrido en los últimos 60 días, del más reciente al más antiguo.'),
  overdue: z.array(timelineItem).describe('Compromisos abiertos con fecha anterior a hoy.'),
  upcoming: z.array(timelineItem).describe('Compromisos que vencen de hoy al fin del horizonte.'),
});

// Internal API of the Platform service.
export const platformRoutes: RouteContract[] = [
  { method: 'get', path: '/health', summary: 'Estado del servicio y de su base de datos', tag: 'Estado', auth: 'none',
    responses: { 200: { description: 'Estado actual.', schema: healthReport } } },
  { method: 'get', path: '/evidence', summary: 'Evidencias de un hito, riesgo o cambio', tag: 'Evidencias', auth: 'session',
    query: evidenceTargetQuery.shape,
    responses: { 200: { description: 'Evidencias en orden de carga, incluidas las retiradas.', schema: z.array(evidence) }, 400: errors.invalidRequest, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/evidence', summary: 'Agregar evidencia de texto, archivo o ambos', tag: 'Evidencias', auth: 'session',
    body: addEvidenceForm, bodyType: 'multipart',
    responses: {
      201: { description: 'Evidencia registrada con su autor y fecha.', schema: evidence },
      400: { description: 'Datos inválidos (`invalid_request`), sin texto ni archivo (`empty_evidence`) o tipo de archivo no aceptado según su contenido real (`file_type_not_allowed`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      413: { description: 'El archivo supera 10 MB (`file_too_large`).', schema: errorResponse },
    } },
  { method: 'get', path: '/evidence/:id/file', summary: 'Descargar el archivo de una evidencia', tag: 'Evidencias', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Contenido del archivo. Las imágenes se pueden mostrar; los demás tipos se entregan como descarga.' }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/evidence/:id/withdraw', summary: 'Retirar una evidencia con motivo', tag: 'Evidencias', auth: 'session',
    params: { id: z.uuid() }, body: withdrawEvidenceBody,
    responses: {
      200: { description: 'Evidencia retirada: el archivo se elimina y queda el registro.', schema: evidence },
      400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Ya estaba retirada (`already_withdrawn`).', schema: errorResponse },
    } },
  { method: 'get', path: '/notifications', summary: 'Mis notificaciones', tag: 'Notificaciones', auth: 'session',
    responses: { 200: { description: 'Las 100 más recientes del usuario.', schema: inbox }, 401: errors.unauthenticated } },
  { method: 'post', path: '/notifications/read-all', summary: 'Marcar todas como leídas', tag: 'Notificaciones', auth: 'session',
    responses: { 200: { description: 'Bandeja actualizada. Leer no resuelve alertas ni cierra acciones.', schema: inbox }, 401: errors.unauthenticated } },
  { method: 'post', path: '/notifications/:id/read', summary: 'Marcar una notificación como leída', tag: 'Notificaciones', auth: 'session',
    params: { id: z.uuid() },
    responses: { 200: { description: 'Bandeja actualizada.', schema: inbox }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'get', path: '/history', summary: 'Historial del proyecto', tag: 'Historial', auth: 'session',
    query: historyQuery.shape,
    responses: { 200: { description: 'Cambios, revisiones, riesgos, hitos, acciones, alertas y evaluaciones oficiales, con autor, fecha y motivo. Paginado sin límite total.', schema: historyPage }, 400: errors.invalidRequest, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'get', path: '/history/timeline', summary: 'Línea de tiempo del proyecto', tag: 'Historial', auth: 'session',
    query: timelineQuery.shape,
    responses: { 200: { description: 'Pasado reciente, lo vencido hoy y lo que vence dentro del horizonte de ciclos.', schema: timeline }, 400: errors.invalidRequest, 401: errors.unauthenticated, 404: errors.notFound } },
];
