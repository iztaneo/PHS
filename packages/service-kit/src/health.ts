import type { DatabaseStatus } from './database.js';

export interface HealthReport {
  service: string;
  status: 'ok' | 'degraded';
  database?: DatabaseStatus;
}

export function healthReport(service: string, database?: DatabaseStatus): HealthReport {
  if (database === undefined) return { service, status: 'ok' };
  return { service, status: database === 'ok' ? 'ok' : 'degraded', database };
}
