import { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

// Who may call a route:
// none     - no authentication
// session  - browser session cookie, validated by the gateway
// admin    - session of an administrator
// internal - identity signed by the gateway (x-phs-internal-auth); never reachable from the browser
export type RouteAuth = 'none' | 'session' | 'admin' | 'internal';

export interface RouteContract {
  method: HttpMethod;
  // Express-style path, e.g. /admin/users/:id
  path: string;
  summary: string;
  tag: string;
  auth: RouteAuth;
  params?: Record<string, z.ZodType>;
  query?: Record<string, z.ZodType>;
  headers?: Record<string, z.ZodType>;
  body?: z.ZodType;
  responses: Record<number, { description: string; schema?: z.ZodType }>;
}

export const errorResponse = z.object({
  code: z.string().describe('Código estable del error, pensado para que el cliente decida el mensaje.'),
});

export const text = (max: number) => z.string().trim().min(1).max(max);

export const practiceRole = z.enum(['pm', 'lead', 'director']).describe('Rol de un usuario en una práctica.');

export const membership = z.object({ practiceId: z.uuid(), practiceName: z.string(), role: practiceRole });

export const healthReport = z.object({
  service: z.string(),
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['ok', 'down']).optional(),
});

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const idempotencyKey = z.string().min(8).max(200)
  .describe('Clave única generada por el cliente para este comando. Repetir la petición con la misma clave devuelve el resultado original.');

export const conflictResponse = z.object({
  code: z.string(),
  currentRevision: z.number().int().optional().describe('Revisión vigente cuando el conflicto es de versión.'),
});

export const errors = {
  invalidRequest: { description: 'Datos inválidos (`invalid_request`).', schema: errorResponse },
  unauthenticated: { description: 'Sin sesión válida (`authentication_required`).', schema: errorResponse },
  forbidden: { description: 'Sin permiso (`forbidden`).', schema: errorResponse },
  notFound: { description: 'No existe o está fuera del alcance del usuario (`not_found`).', schema: errorResponse },
} as const;
