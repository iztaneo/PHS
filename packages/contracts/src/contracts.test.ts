import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openApiDocuments, ownRoutes, type ServiceName } from './documents.js';
import { publicRoutes } from './gateway.js';

const docs = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/api');
const names = Object.keys(openApiDocuments) as ServiceName[];

describe('OpenAPI contracts', () => {
  it.each(names)('docs/api/%s.openapi.json matches the contracts (run pnpm api:docs)', (name) => {
    const saved = JSON.parse(readFileSync(join(docs, `${name}.openapi.json`), 'utf8'));
    expect(saved).toEqual(JSON.parse(JSON.stringify(openApiDocuments[name]())));
  });

  it.each(names)('%s declares every route once, with a success response and an error schema', (name) => {
    const keys = ownRoutes[name].map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const route of ownRoutes[name]) {
      const statuses = Object.keys(route.responses).map(Number);
      expect(statuses.some((status) => status >= 200 && status < 300), `${route.path} success`).toBe(true);
      for (const status of statuses.filter((s) => s >= 400)) {
        expect(route.responses[status]?.schema, `${route.path} ${status}`).toBeDefined();
      }
    }
  });

  it('the public contract never exposes internal session routes or tokens', () => {
    const paths = publicRoutes.map((route) => route.path);
    expect(paths.some((path) => path.includes('/sessions'))).toBe(false);
    expect(paths.every((path) => path.startsWith('/api/v1/'))).toBe(true);
    const publicDoc = JSON.stringify(openApiDocuments.gateway().paths);
    expect(publicDoc).not.toContain('"token"');
    expect(publicDoc).toContain('Idempotency-Key');
    for (const route of publicRoutes.filter((r) => r.auth !== 'none')) {
      expect(Object.keys(route.responses)).toContain('401');
    }
  });
});
