import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { HealthController } from './health.controller.js';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { OpenApiController } from './openapi.controller.js';
import { ProjectsClient } from './projects.client.js';
import { LocalStorage, resolveStorageDirectory } from './storage.js';

@Module({
  controllers: [HealthController, OpenApiController, EvidenceController],
  providers: [
    InternalAuthGuard,
    { provide: PG_POOL, useFactory: () => createPool(requireEnv('PLATFORM_DATABASE_URL')) },
    {
      provide: EvidenceService,
      useFactory: (pool: pg.Pool) => new EvidenceService(
        pool, new ProjectsClient(requireEnv('PROJECTS_URL')), new LocalStorage(resolveStorageDirectory(requireEnv('EVIDENCE_DIR')))),
      inject: [PG_POOL],
    },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
