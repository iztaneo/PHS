import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { HealthController } from './health.controller.js';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { OpenApiController } from './openapi.controller.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  // CatalogController first: its fixed path must win over ProjectsController's ':id'.
  controllers: [HealthController, OpenApiController, CatalogController, ProjectsController],
  providers: [
    InternalAuthGuard,
    { provide: PG_POOL, useFactory: () => createPool(requireEnv('PROJECTS_DATABASE_URL')) },
    { provide: ProjectsService, useFactory: (pool: pg.Pool) => new ProjectsService(pool), inject: [PG_POOL] },
    { provide: CatalogService, useFactory: (pool: pg.Pool) => new CatalogService(pool), inject: [PG_POOL] },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
