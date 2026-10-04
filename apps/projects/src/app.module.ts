import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { BaselinesService } from './baselines.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { HealthController } from './health.controller.js';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { MilestonesService } from './milestones.service.js';
import { OpenApiController } from './openapi.controller.js';
import { ProjectChildrenController } from './project-children.controller.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { TeamService } from './team.service.js';

@Module({
  // CatalogController first: its fixed path must win over ProjectsController's ':id'.
  controllers: [HealthController, OpenApiController, CatalogController, ProjectsController, ProjectChildrenController],
  providers: [
    InternalAuthGuard,
    { provide: PG_POOL, useFactory: () => createPool(requireEnv('PROJECTS_DATABASE_URL')) },
    { provide: ProjectsService, useFactory: (pool: pg.Pool) => new ProjectsService(pool), inject: [PG_POOL] },
    { provide: TeamService, useFactory: (pool: pg.Pool, projects: ProjectsService) => new TeamService(pool, projects), inject: [PG_POOL, ProjectsService] },
    { provide: MilestonesService, useFactory: (pool: pg.Pool, projects: ProjectsService) => new MilestonesService(pool, projects), inject: [PG_POOL, ProjectsService] },
    { provide: BaselinesService, useFactory: (pool: pg.Pool, projects: ProjectsService) => new BaselinesService(pool, projects), inject: [PG_POOL, ProjectsService] },
    { provide: CatalogService, useFactory: (pool: pg.Pool) => new CatalogService(pool), inject: [PG_POOL] },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
