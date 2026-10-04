import { Inject, Injectable } from '@nestjs/common';
import type { HealthReport } from '@phs/service-kit';
import type { ServiceRoute } from './routes.js';

export const SERVICE_ROUTES = Symbol('SERVICE_ROUTES');

export interface ServiceStatus {
  service: string;
  status: 'ok' | 'degraded' | 'unreachable';
  database?: 'ok' | 'down';
}

export interface SystemStatus {
  status: 'ok' | 'degraded';
  services: ServiceStatus[];
}

@Injectable()
export class StatusService {
  constructor(@Inject(SERVICE_ROUTES) private readonly routes: ServiceRoute[]) {}

  async check(): Promise<SystemStatus> {
    const services = await Promise.all(this.routes.map((route) => this.checkOne(route)));
    const allOk = services.every((service) => service.status === 'ok');
    return { status: allOk ? 'ok' : 'degraded', services };
  }

  private async checkOne(route: ServiceRoute): Promise<ServiceStatus> {
    try {
      const response = await fetch(new URL('/health', route.target), { signal: AbortSignal.timeout(2000) });
      if (!response.ok) return { service: route.name, status: 'unreachable' };
      const report = (await response.json()) as HealthReport;
      return { service: route.name, status: report.status, database: report.database };
    } catch {
      return { service: route.name, status: 'unreachable' };
    }
  }
}
