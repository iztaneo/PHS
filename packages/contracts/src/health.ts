import { z } from 'zod';
import { conflictResponse, errorResponse, errors, healthReport, idempotencyKey, text, type RouteContract } from './common.js';

const score = z.string().nullable().describe('Decimal con dos decimales; null cuando no hay dato.');
export const deduction = z.object({
  code: z.string().describe('Causa de la resta, por ejemplo `milestone_overdue`.'),
  count: z.number().describe('Cuántas veces ocurrió, o la magnitud medida.'),
  points: z.string().describe('Puntos restados a la dimensión.'),
});
export const dimensionResult = z.object({
  key: z.enum(['performance', 'financial', 'risks', 'client', 'governance', 'team']),
  weight: z.number().int(),
  score: score.describe('null: sin dato; no entra al promedio y baja la confianza.'),
  deductions: z.array(deduction),
});
export const gateResult = z.object({
  key: z.enum(['project_deviation', 'financial_deviation', 'critical_milestone_overdue', 'critical_risk', 'review_overdue', 'client_critical']),
  cap: z.number().int().describe('Tope del score cuando la regla está activa.'),
  active: z.boolean(),
});
export const assessment = z.object({
  projectId: z.uuid(),
  stored: z.boolean().describe('false: el proyecto no tiene línea base; el resultado se calcula pero no se conserva como historia.'),
  kind: z.enum(['operational']),
  publication: z.enum(['provisional', 'official']),
  effectiveOn: z.iso.date(),
  calculatedAt: z.iso.datetime({ offset: true }),
  projectRevision: z.number().int().describe('Versión de los datos del proyecto con la que se calculó.'),
  ruleSetVersion: z.string(),
  score: score.describe('null: "Sin evaluación", ninguna dimensión tiene dato.'),
  band: z.enum(['healthy', 'attention', 'risk']).nullable().describe('Semáforo: 80 o más, 60 a menos de 80, menos de 60.'),
  weightedScore: score.describe('Promedio ponderado de las dimensiones con dato.'),
  gateCap: score.describe('Menor tope activo; 100.00 si no hay ninguno.'),
  confidence: z.object({ value: z.string(), level: z.enum(['high', 'medium', 'low']) }).describe('Calidad y actualidad de la información, separada de la salud.'),
  dimensions: z.array(dimensionResult),
  gates: z.array(gateResult),
  metrics: z.object({
    committedProgress: score, actualProgress: score, projectDeviation: score, financialDeviation: score, effortDeviation: score,
  }),
  financialsHidden: z.boolean().describe('true: el usuario no puede ver datos económicos (D05).'),
});

const person = z.object({ id: z.uuid(), displayName: z.string() });
const stamp = z.iso.datetime({ offset: true });

// ---- Events, responses and actions (PHS-030 to PHS-032, D04)
export const eventRule = z.enum([
  'milestone_overdue', 'risk_mitigation_overdue', 'risk_materialized', 'project_deviation', 'financial_deviation',
  'renewal_due', 'change_pending',
]);
export const eventResponse = z.object({
  id: z.uuid(),
  revisionNo: z.number().int(),
  cause: z.string().describe('Por qué se produjo la desviación.'),
  kind: z.enum(['remediation', 'replan']).describe('remediation: plan para cumplir la fecha. replan: se propone un cambio aprobado.'),
  plan: z.string(),
  changeId: z.uuid().nullable().describe('Propuesta de cambio que replanifica; obligatoria cuando kind es replan.'),
  submittedBy: person,
  submittedAt: stamp,
  validation: z.object({ decision: z.enum(['validated', 'returned']), validator: person, decidedAt: stamp, comment: z.string() }).nullable(),
});
export const taskStatus = z.enum(['pending', 'in_progress', 'blocked', 'completed', 'cancelled']);
export const task = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  projectName: z.string(),
  eventId: z.uuid().nullable(),
  title: z.string(),
  description: z.string(),
  owner: person,
  dueOn: z.iso.date(),
  priority: z.enum(['high', 'medium', 'low']),
  status: taskStatus,
  automatic: z.boolean().describe('true: la generó una regla a partir de un evento.'),
  overdue: z.boolean().describe('Abierta y con plazo vencido. Una acción vencida se escala; no genera otra acción.'),
  closedAt: stamp.nullable(),
  closureNote: z.string().nullable(),
  revision: z.number().int(),
  canUpdate: z.boolean(),
});
export const healthEvent = z.object({
  id: z.uuid(),
  ruleKey: eventRule,
  severity: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  episode: z.number().int().describe('Una condición que reaparece después de resolverse abre un episodio nuevo.'),
  target: z.object({ kind: z.enum(['milestone', 'risk', 'renewal', 'change']), id: z.uuid() }).nullable(),
  openedAt: stamp,
  resolvedAt: stamp.nullable(),
  resolutionNote: z.string().nullable(),
  responseStatus: z.enum(['not_required', 'missing', 'pending', 'returned', 'validated'])
    .describe('Las alertas críticas exigen causa y plan validados por el líder.'),
  response: eventResponse.nullable().describe('La respuesta más reciente.'),
  task: task.nullable(),
  canRespond: z.boolean(),
  canValidate: z.boolean(),
});
export const createResponseBody = z.object({
  cause: text(2000),
  kind: z.enum(['remediation', 'replan']),
  plan: text(4000),
  changeId: z.uuid().nullable().default(null),
});
export const validateResponseBody = z.object({ decision: z.enum(['validated', 'returned']), comment: text(2000) });
export const createTaskBody = z.object({
  title: text(200),
  description: z.string().trim().max(4000).default(''),
  ownerId: z.uuid(),
  dueOn: z.iso.date(),
  priority: z.enum(['high', 'medium', 'low']),
  eventId: z.uuid().nullable().default(null),
});
export const transitionTaskBody = z.object({
  expectedRevision: z.number().int().min(1),
  to: taskStatus,
  note: text(2000).optional().describe('Obligatoria al completar o cancelar.'),
});

// Internal API of the Health service.
export const healthRoutes: RouteContract[] = [
  { method: 'get', path: '/health', summary: 'Estado del servicio y de su base de datos', tag: 'Estado', auth: 'none',
    responses: { 200: { description: 'Estado actual.', schema: healthReport } } },
  { method: 'get', path: '/assessments/:projectId', summary: 'Evaluación de salud vigente de un proyecto', tag: 'Salud', auth: 'session',
    params: { projectId: z.uuid() },
    responses: {
      200: { description: 'Evaluación para la versión actual de los datos y la fecha de hoy en la zona del proyecto. Se calcula y guarda la primera vez que se pide.', schema: assessment },
      401: errors.unauthenticated, 404: errors.notFound,
    } },
  { method: 'get', path: '/projects/:projectId/events', summary: 'Eventos de salud del proyecto', tag: 'Eventos y acciones', auth: 'session',
    params: { projectId: z.uuid() },
    responses: { 200: { description: 'Eventos abiertos y resueltos. Antes de responder se detectan las condiciones vigentes: se abren los eventos nuevos, con su acción automática, y se resuelven los que ya no aplican.', schema: z.array(healthEvent) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/events/:eventId/responses', summary: 'Registrar causa y plan de remediación o replanificación', tag: 'Eventos y acciones', auth: 'session',
    params: { eventId: z.uuid() }, body: createResponseBody,
    responses: {
      201: { description: 'Respuesta registrada, pendiente de validación del líder.', schema: healthEvent },
      400: { description: 'Datos inválidos o replanificación sin propuesta de cambio (`change_required`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'El evento no exige respuesta o ya está resuelto (`response_not_expected`), o la respuesta vigente aún no se decide o ya fue validada (`response_already_submitted`).', schema: errorResponse },
    } },
  { method: 'post', path: '/responses/:responseId/validation', summary: 'Validar o devolver una respuesta', tag: 'Eventos y acciones', auth: 'session',
    params: { responseId: z.uuid() }, body: validateResponseBody,
    responses: {
      201: { description: 'Decisión registrada. Devolver obliga al PM a responder de nuevo.', schema: healthEvent },
      400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'La respuesta ya tenía decisión (`already_decided`).', schema: errorResponse },
    } },
  { method: 'get', path: '/projects/:projectId/tasks', summary: 'Acciones del proyecto', tag: 'Eventos y acciones', auth: 'session',
    params: { projectId: z.uuid() },
    responses: { 200: { description: 'Acciones automáticas y manuales, primero las abiertas.', schema: z.array(task) }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'post', path: '/projects/:projectId/tasks', summary: 'Crear una acción manual', tag: 'Eventos y acciones', auth: 'session',
    params: { projectId: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: createTaskBody,
    responses: {
      201: { description: 'Acción creada.', schema: task },
      400: { description: 'Datos inválidos, `idempotency_key_required` o responsable no habilitado (`responsible_not_enabled`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: '`idempotency_key_reused`.', schema: errorResponse },
    } },
  { method: 'get', path: '/tasks/mine', summary: 'Mis acciones abiertas en todos los proyectos', tag: 'Eventos y acciones', auth: 'session',
    responses: { 200: { description: 'Acciones abiertas asignadas al usuario, por plazo.', schema: z.array(task) }, 401: errors.unauthenticated } },
  { method: 'post', path: '/tasks/:taskId/transition', summary: 'Cambiar el estado de una acción', tag: 'Eventos y acciones', auth: 'session',
    params: { taskId: z.uuid() }, body: transitionTaskBody,
    responses: {
      200: { description: 'Acción actualizada. Completarla no resuelve el evento si la condición sigue vigente.', schema: task },
      400: { description: 'Datos inválidos o falta el comentario de cierre (`note_required`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Otro usuario la modificó (`revision_conflict`) o la transición no está permitida (`invalid_transition`).', schema: conflictResponse },
    } },
];
