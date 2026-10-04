import { Controller, Get, Inject } from '@nestjs/common';
import { healthReport, type HealthReport } from '@phs/service-kit';
import { StatusService, type SystemStatus } from './status.service.js';

@Controller()
export class StatusController {
  constructor(@Inject(StatusService) private readonly statusService: StatusService) {}

  @Get('health')
  health(): HealthReport {
    return healthReport('gateway');
  }

  @Get('api/v1/status')
  status(): Promise<SystemStatus> {
    return this.statusService.check();
  }
}
