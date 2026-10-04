import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { HealthController } from './health.controller.js';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { WhoamiController } from './whoami.controller.js';

@Module({
  controllers: [HealthController, WhoamiController],
  providers: [InternalAuthGuard, { provide: PG_POOL, useFactory: () => createPool(requireEnv('PROJECTS_DATABASE_URL')) }],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
