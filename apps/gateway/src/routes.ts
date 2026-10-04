import { requireEnv } from '@phs/service-kit';

export interface ServiceRoute {
  name: string;
  prefix: string;
  target: string;
}

export function identityUrl(): string {
  return requireEnv('IDENTITY_URL');
}

// Services whose health the gateway reports.
export function monitoredServices(): ServiceRoute[] {
  return [{ name: 'identity', prefix: '', target: identityUrl() }, ...proxiedRoutes()];
}

// Public prefix -> internal service, for authenticated users only. Identity is never proxied:
// its session endpoints are exposed through SessionController. Health and Platform come later.
export function proxiedRoutes(): ServiceRoute[] {
  return [{ name: 'projects', prefix: '/api/v1/projects', target: requireEnv('PROJECTS_URL') }];
}
