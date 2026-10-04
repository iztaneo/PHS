import { z } from 'zod';
import { errors, healthReport, type RouteContract } from './common.js';

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
];
