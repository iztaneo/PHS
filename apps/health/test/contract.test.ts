import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ownRoutes } from '@phs/contracts';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

process.env.INTERNAL_AUTH_SECRET ??= 'test-secret-with-at-least-32-characters';
process.env.HEALTH_DATABASE_URL ??= 'postgres://unused@127.0.0.1:1/unused';
process.env.PROJECTS_URL ??= 'http://projects.test';

interface Layer { route?: { path: string; methods: Record<string, boolean> } }

describe('health routes and contract', () => {
  it('implements exactly the routes the contract declares', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const stack = (app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } }).router.stack;
    const implemented = stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route!.methods).map((method) => `${method} ${layer.route!.path}`))
      .filter((route) => route !== 'get /openapi.json')
      .sort();
    await app.close();
    expect(implemented).toEqual(ownRoutes.health.map((route) => `${route.method} ${route.path}`).sort());
  });
});
