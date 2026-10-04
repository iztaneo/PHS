import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { AuthService } from './auth.service.js';
import { authConfig } from './config.js';
import { HealthController } from './health.controller.js';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { SessionController } from './session.controller.js';

@Module({
  controllers: [HealthController, SessionController],
  providers: [
    InternalAuthGuard,
    { provide: PG_POOL, useFactory: () => createPool(requireEnv('IDENTITY_DATABASE_URL')) },
    { provide: AuthService, useFactory: (pool: pg.Pool) => new AuthService(pool, authConfig()), inject: [PG_POOL] },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
