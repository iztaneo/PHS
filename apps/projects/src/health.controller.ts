import { Controller, Get, Inject } from '@nestjs/common';
import { PG_POOL, checkDatabase, healthReport, type HealthReport } from '@phs/service-kit';
import type pg from 'pg';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  @Get()
  async health(): Promise<HealthReport> {
    return healthReport('projects', await checkDatabase(this.pool));
  }
}
