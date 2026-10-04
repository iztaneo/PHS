import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { HealthController } from './health.controller.js';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { OpenApiController } from './openapi.controller.js';
import { ProjectsClient } from './projects.client.js';

@Module({
  controllers: [HealthController, OpenApiController, AssessmentsController],
  providers: [
    InternalAuthGuard,
    { provide: PG_POOL, useFactory: () => createPool(requireEnv('HEALTH_DATABASE_URL')) },
    { provide: ProjectsClient, useFactory: () => new ProjectsClient(requireEnv('PROJECTS_URL')) },
    {
      provide: AssessmentsService,
      useFactory: (pool: pg.Pool, projects: ProjectsClient) => new AssessmentsService(pool, projects),
      inject: [PG_POOL, ProjectsClient],
    },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
