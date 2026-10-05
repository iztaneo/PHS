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
  confidence: z.object({
    value: z.string(), level: z.enum(['high', 'medium', 'low']),
    deductions: z.array(deduction).describe('Cada resta a partir de 100; vacío en evaluaciones guardadas antes de BIT-0026.'),
  }).describe('Calidad y actualidad de la información, separada de la salud.'),
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
  'renewal_due', 'change_pending', 'review_overdue', 'review_returned',
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

// ---- Review cycle and Health Review (PHS-020 to PHS-024; D02, D03)
export const cadence = z.enum(['weekly', 'fortnightly', 'monthly']).describe('weekly: 7 días. fortnightly: 14 días. monthly: mes calendario.');
export const reviewTopic = z.enum(['schedule', 'milestones', 'risks', 'client', 'finance', 'scope', 'team'])
  .describe('Qué cambió, como en el prototipo: cronograma, hitos, riesgos, cliente, finanzas, alcance, equipo.');
export const confidenceLevel = z.enum(['high', 'medium', 'low']);
const amountText = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/).describe('Decimal no negativo como texto, hasta dos decimales.');
export const reviewFinance = z.object({ totalCost: amountText, totalEffortHours: amountText.nullable() })
  .describe('Costo real acumulado y esfuerzo consumido a la fecha de la revisión.');
export const climate = z.enum(['good', 'tense', 'critical']);
const policyFields = {
  cadence,
  nextDueOn: z.iso.date().describe('Próxima fecha de revisión. Su día de la semana (o del mes, en la cadencia mensual) es el día de corte de los ciclos siguientes.'),
  forecastCycles: z.number().int().min(1).max(12).describe('Ciclos futuros que se consideran al listar renovaciones próximas.'),
  evidenceRequired: z.boolean().describe('Exigir texto de soporte al enviar una revisión con cambios.'),
  leadValidationRequired: z.boolean().describe('false: la revisión se cierra al enviarla, sin validación del líder.'),
  autoTasks: z.boolean().describe('false: los eventos se abren sin acción automática.'),
};
export const reviewPolicy = z.object({ ...policyFields, revision: z.number().int() });
export const savePolicyBody = z.object({
  ...policyFields,
  expectedRevision: z.number().int().min(0).describe('0 al configurar por primera vez.'),
});
export const expectation = z.object({
  kind: z.enum(['milestone', 'risk', 'task', 'renewal', 'change', 'alert']),
  id: z.uuid(),
  title: z.string(),
  dueOn: z.iso.date().nullable(),
  overdue: z.boolean(),
  critical: z.boolean(),
  blocking: z.boolean().describe('true: alerta crítica sin causa y plan; impide enviar "nada cambió".'),
});
const draftPayload = z.object({
  nothingChanged: z.boolean().default(false),
  topics: z.array(reviewTopic).max(7).default([]),
  notes: z.partialRecord(reviewTopic, z.string().max(4000)).default({}),
  clientClimate: climate.nullable().default(null),
  supportText: z.string().max(8000).default(''),
  activeSeconds: z.number().int().min(0).max(86_400).default(0),
  declaredConfidence: confidenceLevel.nullable().default(null),
  finance: z.object({ totalCost: z.string().max(20), totalEffortHours: z.string().max(20).nullable() }).nullable().default(null),
});
export const saveDraftBody = z.object({
  expectedRevision: z.number().int().min(0).describe('0 si aún no hay borrador.'),
  payload: draftPayload,
});
export const submitReviewBody = z.object({
  nothingChanged: z.boolean(),
  topics: z.array(reviewTopic).max(7),
  notes: z.partialRecord(reviewTopic, z.string().trim().max(4000)).describe('Comentario opcional por tema.'),
  clientClimate: climate.nullable().describe('Obligatorio cuando el tema `client` está seleccionado.'),
  declaredConfidence: confidenceLevel.nullable().describe('Confianza que declara el PM; el sistema sugiere la calculada.'),
  finance: reviewFinance.nullable().describe('Con el tema `finance`: se registra como observación económica del proyecto al enviar.'),
  supportText: z.string().trim().max(8000),
  activeSeconds: z.number().int().min(0).max(86_400),
  expectedProjectRevision: z.number().int().min(1).describe('Versión de los datos del proyecto que el PM tenía a la vista.'),
});
export const validateReviewBody = z.object({ decision: z.enum(['validated', 'returned']), comment: text(2000) });
export const review = z.object({
  id: z.uuid(),
  revisionNo: z.number().int(),
  author: person,
  submittedAt: stamp,
  effectiveOn: z.iso.date(),
  late: z.boolean().describe('Enviada después del vencimiento del ciclo.'),
  nothingChanged: z.boolean(),
  topics: z.array(reviewTopic),
  notes: z.partialRecord(reviewTopic, z.string()),
  clientClimate: climate.nullable(),
  declaredConfidence: confidenceLevel.nullable(),
  finance: reviewFinance.nullable().describe('Cifras que este envío registró en la economía del proyecto.'),
  supportText: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  expectations: z.array(expectation).describe('Lo que se esperaba al momento del envío.'),
  assessment: z.object({ score, band: z.enum(['healthy', 'attention', 'risk']).nullable() }).nullable()
    .describe('Evaluación oficial calculada con este envío (D02); null si el proyecto no tiene línea base.'),
  validation: z.object({ decision: z.enum(['validated', 'returned']), validator: person, decidedAt: stamp, comment: z.string() }).nullable(),
});
export const reviewCycle = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  projectName: z.string(),
  startsOn: z.iso.date(),
  dueOn: z.iso.date(),
  status: z.enum(['open', 'overdue', 'submitted', 'returned', 'validated', 'closed'])
    .describe('open/overdue: sin envío. submitted: en validación del líder. returned: devuelta, el PM debe reenviar. validated: validada. closed: enviada sin exigir validación.'),
  policy: z.object({ cadence, forecastCycles: z.number().int(), evidenceRequired: z.boolean(), leadValidationRequired: z.boolean() })
    .describe('Política vigente cuando se programó el ciclo.'),
  expectations: z.array(expectation).describe('Calculadas ahora si el ciclo admite envío; si no, las del último envío.'),
  draft: z.object({ revision: z.number().int(), payload: draftPayload, updatedAt: stamp }).nullable().describe('Borrador del usuario que consulta.'),
  reviews: z.array(review).describe('Envíos del ciclo, del más reciente al más antiguo.'),
  lastClimate: climate.nullable().describe('Clima del cliente del último envío del proyecto, para precargarlo.'),
  projectRevision: z.number().int(),
  canSubmit: z.boolean(),
  canValidate: z.boolean(),
});
export const reviewSchedule = z.object({
  projectId: z.uuid(),
  policy: reviewPolicy.nullable().describe('null: el proyecto no tiene ciclo configurado.'),
  canConfigure: z.boolean(),
  cycles: z.array(reviewCycle).describe('Ciclos del proyecto, del más reciente al más antiguo (máximo 12).'),
});

export const holiday = z.object({ day: z.iso.date(), name: z.string() });
export const holidayQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
export const addHolidayBody = z.object({ day: z.iso.date(), name: text(120) });

// ---- Rule set in force (PHS-039)
export const ruleSet = z.object({
  version: z.string(),
  gateThresholds: z.object({ projectDeviation: z.string(), financialDeviation: z.string() }).describe('Umbrales estrictos: el tope aplica al superarlos.'),
  dimensionWeights: z.record(z.string(), z.number()).describe('Peso de cada dimensión; suman 100.'),
  gateCaps: z.record(z.string(), z.number()).describe('Tope del score cuando la regla crítica está activa.'),
  bands: z.object({ healthy: z.number(), attention: z.number() }),
  confidence: z.object({ defaultCadenceDays: z.number() }),
  trend: z.object({ improving: z.number(), deteriorating: z.number() }),
  forecast: z.object({
    milestone: z.number(), criticalMilestone: z.number(), riskPerSeverityPoint: z.string(), task: z.number(), renewal: z.number(),
    perPointOfDecline: z.string(), activeDeviationGate: z.number(), levels: z.object({ atRisk: z.number(), deteriorating: z.number() }),
    defaultCadence: z.string(), defaultCycles: z.number(),
  }),
});

// ---- Trend and forecast (PHS-028, PHS-029)
const cut = z.object({
  cycleDueOn: z.iso.date(), effectiveOn: z.iso.date(), score, ruleSetVersion: z.string(),
}).describe('Evaluación oficial de un ciclo de revisión.');
export const outlook = z.object({
  projectId: z.uuid(),
  today: z.iso.date(),
  trend: z.object({
    direction: z.enum(['up', 'down', 'flat']).nullable().describe('up: 3 puntos o más. down: −3 o menos. null: no comparable, ver `reason`.'),
    delta: score,
    reason: z.enum(['insufficient_history', 'rule_set_changed', 'no_score']).nullable(),
    current: cut.nullable(), previous: cut.nullable(),
  }).describe('Diferencia entre los cortes oficiales de los dos últimos ciclos.'),
  forecast: z.object({
    pressure: z.string().describe('Suma de los factores.'),
    projectedScore: score.describe('Score actual menos la presión, sin bajar de 0. Escenario determinista si no se interviene; no es una probabilidad.'),
    level: z.enum(['stable', 'at_risk', 'deteriorating']).describe('Menos de 8, de 8 a menos de 20, 20 o más.'),
    factors: z.array(z.object({
      code: z.enum(['milestone_due', 'critical_milestone_due', 'risk_mitigation_due', 'task_due', 'renewal_due', 'declining_trend', 'project_deviation', 'financial_deviation']),
      target: z.object({ kind: z.enum(['milestone', 'risk', 'task', 'renewal']), id: z.uuid(), title: z.string(), dueOn: z.iso.date() }).nullable(),
      points: z.string(),
    })),
    horizon: z.object({
      cadence, cycles: z.number().int(), until: z.iso.date(),
      assumed: z.boolean().describe('true: el proyecto no tiene ciclo configurado y se usó el horizonte por defecto.'),
    }),
  }),
});
export const schedulerStatus = z.object({
  intervalSeconds: z.number().int().describe('0: el proceso programado está desactivado.'),
  lastRun: z.object({
    startedAt: stamp, finishedAt: stamp.nullable().describe('null: en curso o interrumpida.'),
    projects: z.number().int(), failures: z.number().int().describe('Proyectos que fallaron; se reintentan en la siguiente pasada.'),
  }).nullable(),
});

// ---- Health Center (PHS-035, PHS-036)
export const centerProject = z.object({
  id: z.uuid(), code: z.string(), name: z.string(), status: z.string(), practiceId: z.uuid(), practiceName: z.string(), clientName: z.string(), pmName: z.string(),
  mine: z.boolean().describe('true: el usuario es el PM del proyecto.'),
  assessed: z.boolean().describe('false: no se pudo calcular la evaluación; no equivale a "sin evaluación".'),
  score: score.describe('null: sin evaluación; nunca se presenta como saludable.'),
  band: z.enum(['healthy', 'attention', 'risk']).nullable(),
  confidenceLevel: confidenceLevel.nullable(),
  review: z.object({ status: z.enum(['open', 'overdue', 'submitted', 'returned']), dueOn: z.iso.date() }).nullable().describe('Ciclo que espera envío, corrección o validación.'),
  counts: z.object({
    criticalAlerts: z.number().int().describe('Alertas críticas sin causa y plan.'),
    overdueActions: z.number().int(),
    upcomingMilestones: z.number().int().describe('Hitos que vencen en los próximos 7 días.'),
    upcomingRisks: z.number().int().describe('Mitigaciones que vencen en los próximos 7 días.'),
    pendingDecisions: z.number().int().describe('Revisiones, cambios y respuestas que esperan decisión del usuario; 0 si no decide en el proyecto.'),
  }),
});
export const focusItem = z.object({
  kind: z.enum(['review_overdue', 'review_due', 'review_returned', 'review_to_validate', 'change_to_decide', 'response_to_validate',
    'alerts_untreated', 'my_action', 'project_at_risk', 'project_in_attention', 'low_confidence', 'milestone_due', 'risk_due']),
  severity: z.enum(['critical', 'warning', 'info']),
  projectId: z.uuid(), projectName: z.string(),
  subject: z.string().nullable().describe('Título del elemento, o el score o la confianza cuando el foco es el proyecto.'),
  count: z.number().int(),
  dueOn: z.iso.date().nullable(),
  tab: z.enum(['health', 'reviews', 'alerts', 'milestones', 'risks', 'changes']).describe('Pestaña del proyecto donde se atiende.'),
});
export const healthCenter = z.object({
  today: z.iso.date(),
  projects: z.array(centerProject).describe('Proyectos no cerrados del alcance del usuario, del score más bajo al más alto; sin evaluación al final.'),
  focus: z.array(focusItem).describe('Qué atender, por criticidad y después por plazo.'),
  incomplete: z.boolean().describe('true: faltó incluir algo; los conteos no son el panorama completo.'),
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
  { method: 'get', path: '/assessments/rules', summary: 'Conjunto de reglas PHF vigente', tag: 'Salud', auth: 'session',
    responses: { 200: { description: 'Valores que aplica el motor: pesos, topes, umbrales y coeficientes.', schema: ruleSet }, 401: errors.unauthenticated } },
  { method: 'get', path: '/assessments/:projectId/outlook', summary: 'Tendencia entre ciclos y proyección de los próximos', tag: 'Salud', auth: 'session',
    params: { projectId: z.uuid() },
    responses: { 200: { description: 'Tendencia y presión de los compromisos que vencen en el horizonte configurado.', schema: outlook }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'get', path: '/center', summary: 'Health Center: qué atender hoy en mis proyectos', tag: 'Salud', auth: 'session',
    responses: { 200: { description: 'Según el papel del usuario en cada proyecto: lo que debe hacer como PM, lo que debe decidir como líder y dónde mirar como quien gobierna.', schema: healthCenter }, 401: errors.unauthenticated } },
  { method: 'get', path: '/scheduler', summary: 'Estado del proceso programado', tag: 'Estado', auth: 'session',
    responses: { 200: { description: 'Última pasada que actualizó alertas, acciones y evaluaciones sin intervención de usuarios.', schema: schedulerStatus }, 401: errors.unauthenticated } },
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
  { method: 'get', path: '/projects/:projectId/review-schedule', summary: 'Política de revisión y ciclos del proyecto', tag: 'Revisiones', auth: 'session',
    params: { projectId: z.uuid() },
    responses: { 200: { description: 'Un proyecto sin política se devuelve con `policy` null; no recibe un ciclo implícito.', schema: reviewSchedule }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'put', path: '/projects/:projectId/review-policy', summary: 'Configurar cadencia, próxima fecha y políticas', tag: 'Revisiones', auth: 'session',
    params: { projectId: z.uuid() }, body: savePolicyBody,
    responses: {
      200: { description: 'Política guardada. Se programa el ciclo si no había uno sin envío, o se reprograma el que estaba abierto; los ciclos ya enviados no cambian.', schema: reviewSchedule },
      400: { description: 'Datos inválidos o próxima fecha anterior a hoy (`due_date_in_past`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Otro usuario cambió la política (`revision_conflict`) o el proyecto está pausado o cerrado (`project_not_active`).', schema: conflictResponse },
    } },
  { method: 'get', path: '/cycles/:cycleId', summary: 'Un ciclo con sus expectativas, borrador y envíos', tag: 'Revisiones', auth: 'session',
    params: { cycleId: z.uuid() },
    responses: { 200: { description: 'Ciclo.', schema: reviewCycle }, 401: errors.unauthenticated, 404: errors.notFound } },
  { method: 'put', path: '/cycles/:cycleId/draft', summary: 'Guardar el borrador de la revisión', tag: 'Revisiones', auth: 'session',
    params: { cycleId: z.uuid() }, body: saveDraftBody,
    responses: {
      200: { description: 'Borrador guardado para este usuario y ciclo.', schema: reviewCycle },
      400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'El borrador cambió en otra pestaña o sesión (`revision_conflict`), o el ciclo ya no admite envío (`review_already_submitted`).', schema: conflictResponse },
    } },
  { method: 'post', path: '/cycles/:cycleId/reviews', summary: 'Enviar el Health Review del ciclo', tag: 'Revisiones', auth: 'session',
    params: { cycleId: z.uuid() }, headers: { 'Idempotency-Key': idempotencyKey }, body: submitReviewBody,
    responses: {
      201: { description: 'Revisión registrada y vigente desde este momento (D02). El primer envío programa el siguiente ciclo. Repetir la petición con la misma clave devuelve el mismo resultado.', schema: reviewCycle },
      400: { description: 'Datos inválidos, `idempotency_key_required`, falta el texto de soporte (`support_required`) o el clima del cliente (`climate_required`), o Proyectos rechazó las cifras económicas (`finance_rejected`).', schema: errorResponse },
      401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'Los datos del proyecto cambiaron (`revision_conflict`); hay alertas críticas sin causa y plan y se envió "nada cambió" (`nothing_changed_blocked`); el ciclo ya tiene un envío vigente (`review_already_submitted`); el proyecto está pausado o cerrado (`project_not_active`); o `idempotency_key_reused`.', schema: conflictResponse },
    } },
  { method: 'post', path: '/reviews/:reviewId/validation', summary: 'Validar o devolver una revisión', tag: 'Revisiones', auth: 'session',
    params: { reviewId: z.uuid() }, body: validateReviewBody,
    responses: {
      201: { description: 'Decisión registrada. Devolver conserva el envío y abre una acción de corrección para el PM.', schema: reviewCycle },
      400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound,
      409: { description: 'El envío ya tenía decisión (`already_decided`), existe un envío más reciente (`stale_review`) o el ciclo no exige validación (`validation_not_required`).', schema: errorResponse },
    } },
  { method: 'get', path: '/reviews/pending', summary: 'Revisiones que esperan mi validación', tag: 'Revisiones', auth: 'session',
    responses: { 200: { description: 'Ciclos con un envío sin decisión en los proyectos donde el usuario puede decidir.', schema: z.array(reviewCycle) }, 401: errors.unauthenticated } },
  { method: 'get', path: '/holidays', summary: 'Días festivos de un año', tag: 'Revisiones', auth: 'session',
    query: { year: z.coerce.number().int().min(2000).max(2100) },
    responses: { 200: { description: 'Días en que no vence ninguna revisión, además de sábados y domingos: la fecha pasa al siguiente día hábil.', schema: z.array(holiday) }, 400: errors.invalidRequest, 401: errors.unauthenticated } },
  { method: 'post', path: '/holidays', summary: 'Agregar un día festivo', tag: 'Revisiones', auth: 'admin',
    body: addHolidayBody,
    responses: {
      201: { description: 'Festivos del año. Las revisiones sin enviar que vencían ese día se mueven al siguiente día hábil.', schema: z.array(holiday) },
      400: errors.invalidRequest, 401: errors.unauthenticated, 403: errors.forbidden,
      409: { description: 'Ese día ya es festivo (`holiday_taken`).', schema: errorResponse },
    } },
  { method: 'delete', path: '/holidays/:day', summary: 'Quitar un día festivo', tag: 'Revisiones', auth: 'admin',
    params: { day: z.iso.date() },
    responses: { 200: { description: 'Festivos del año. Las revisiones ya programadas no se mueven de vuelta.', schema: z.array(holiday) }, 401: errors.unauthenticated, 403: errors.forbidden, 404: errors.notFound } },
];
