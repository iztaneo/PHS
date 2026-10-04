import { z } from 'zod';
import { errorResponse, errors, healthReport, text, type RouteContract } from './common.js';

const person = z.object({ id: z.uuid(), displayName: z.string() });
export const evidenceTargetKind = z.enum(['milestone', 'risk', 'change']);
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
];
