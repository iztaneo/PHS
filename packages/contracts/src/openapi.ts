import { z } from 'zod';
import type { RouteContract } from './common.js';

export interface OpenApiInfo {
  title: string;
  description: string;
  // 'public' documents cookie sessions; 'internal' documents the gateway signature.
  audience: 'public' | 'internal';
}

type Json = Record<string, unknown>;

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): Json {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io }) as Json;
  return rest;
}

export function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function security(route: RouteContract, audience: OpenApiInfo['audience']): Json[] {
  if (route.auth === 'none') return [];
  if (audience === 'internal' || route.auth === 'internal') return [{ gatewaySignature: [] }];
  return [{ sessionCookie: [] }];
}

function parameters(route: RouteContract): Json[] {
  const of = (place: 'path' | 'query' | 'header', group?: Record<string, z.ZodType>) =>
    Object.entries(group ?? {}).map(([name, schema]) => ({
      name, in: place, required: place === 'path' || !schema.safeParse(undefined).success, schema: jsonSchema(schema, 'input'),
    }));
  return [...of('path', route.params), ...of('query', route.query), ...of('header', route.headers)];
}

export function buildOpenApi(info: OpenApiInfo, routes: RouteContract[]): Json {
  const paths: Record<string, Json> = {};
  for (const route of routes) {
    const responses: Json = {};
    for (const [status, response] of Object.entries(route.responses)) {
      responses[status] = {
        description: response.description,
        ...(response.schema ? { content: { 'application/json': { schema: jsonSchema(response.schema, 'output') } } } : {}),
      };
    }
    const operation: Json = {
      summary: route.summary,
      tags: [route.tag],
      security: security(route, info.audience),
      ...(route.auth === 'admin' ? { description: 'Requiere un usuario administrador.' } : {}),
      ...(parameters(route).length ? { parameters: parameters(route) } : {}),
      ...(route.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(route.body, 'input') } } } }
        : {}),
      responses,
    };
    (paths[openApiPath(route.path)] ??= {})[route.method] = operation;
  }
  return {
    openapi: '3.1.0',
    info: { title: info.title, version: '0.1.0', description: info.description },
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'phs_session', description: 'Cookie de sesión emitida por POST /api/v1/session.' },
        gatewaySignature: { type: 'apiKey', in: 'header', name: 'x-phs-internal-auth', description: 'Identidad firmada por el gateway (HMAC-SHA256, válida 60 s). No se acepta desde el navegador.' },
      },
    },
  };
}
