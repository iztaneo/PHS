import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [{ provide: PG_POOL, useFactory: () => createPool(requireEnv('IDENTITY_DATABASE_URL')) }],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
