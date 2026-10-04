import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { PG_POOL } from '@phs/service-kit';
import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health.controller.js';

async function controllerWith(query: () => Promise<unknown>): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PG_POOL, useValue: { query } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('projects health', () => {
  it('is ok when the database answers', async () => {
    const controller = await controllerWith(async () => ({}));
    expect(await controller.health()).toEqual({ service: 'projects', status: 'ok', database: 'ok' });
  });

  it('is degraded when the database is unreachable', async () => {
    const controller = await controllerWith(async () => { throw new Error('down'); });
    expect(await controller.health()).toEqual({ service: 'projects', status: 'degraded', database: 'down' });
  });
});
