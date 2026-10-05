import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PG_POOL, createPool, requireEnv } from '@phs/service-kit';
import type pg from 'pg';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { CenterService } from './center.service.js';
import { GovernanceController } from './governance.controller.js';
import { GovernanceService } from './governance.service.js';
import { HealthController } from './health.controller.js';
import { HolidayService } from './holiday.service.js';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { OpenApiController } from './openapi.controller.js';
import { PortfolioService } from './portfolio.service.js';
import { ProjectsClient } from './projects.client.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  controllers: [HealthController, OpenApiController, AssessmentsController, GovernanceController, ReviewController],
  providers: [
    InternalAuthGuard,
    { provide: PG_POOL, useFactory: () => createPool(requireEnv('HEALTH_DATABASE_URL')) },
    { provide: ProjectsClient, useFactory: () => new ProjectsClient(requireEnv('PROJECTS_URL')) },
    {
      provide: AssessmentsService,
      useFactory: (pool: pg.Pool, projects: ProjectsClient) => new AssessmentsService(pool, projects),
      inject: [PG_POOL, ProjectsClient],
    },
    {
      provide: GovernanceService,
      useFactory: (pool: pg.Pool, projects: ProjectsClient, assessments: AssessmentsService) => new GovernanceService(pool, projects, assessments),
      inject: [PG_POOL, ProjectsClient, AssessmentsService],
    },
    {
      provide: SchedulerService,
      useFactory: (pool: pg.Pool, governance: GovernanceService, assessments: AssessmentsService) =>
        // Every five minutes unless configured otherwise; 0 turns the timer off.
        new SchedulerService(pool, governance, assessments, Number(process.env.HEALTH_SCHEDULER_SECONDS ?? 300) || 0),
      inject: [PG_POOL, GovernanceService, AssessmentsService],
    },
    {
      provide: CenterService,
      useFactory: (pool: pg.Pool, projects: ProjectsClient, assessments: AssessmentsService) => new CenterService(pool, projects, assessments),
      inject: [PG_POOL, ProjectsClient, AssessmentsService],
    },
    {
      provide: PortfolioService,
      useFactory: (pool: pg.Pool, projects: ProjectsClient, assessments: AssessmentsService) => new PortfolioService(pool, projects, assessments),
      inject: [PG_POOL, ProjectsClient, AssessmentsService],
    },
    { provide: HolidayService, useFactory: (pool: pg.Pool) => new HolidayService(pool), inject: [PG_POOL] },
    {
      provide: ReviewService,
      useFactory: (pool: pg.Pool, projects: ProjectsClient, governance: GovernanceService, assessments: AssessmentsService) =>
        new ReviewService(pool, projects, governance, assessments),
      inject: [PG_POOL, ProjectsClient, GovernanceService, AssessmentsService],
    },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
