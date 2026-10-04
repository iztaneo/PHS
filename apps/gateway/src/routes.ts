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
  return [
    { name: 'identity', prefix: '', target: identityUrl() },
    { name: 'projects', prefix: '', target: requireEnv('PROJECTS_URL') },
    { name: 'health', prefix: '', target: requireEnv('HEALTH_URL') },
    { name: 'platform', prefix: '', target: requireEnv('PLATFORM_URL') },
  ];
}

// Public prefix -> internal service, for authenticated users only. Express strips the prefix and the
// target path is prepended, so /api/v1/admin/users reaches Identity as /admin/users. These mounts run
// before Nest's own controllers, so a prefix must never cover /api/v1/session or /api/v1/status.
// Identity's session endpoints are not proxied. Health and Platform come later.
export function proxiedRoutes(): ServiceRoute[] {
  const projects = requireEnv('PROJECTS_URL');
  return [
    { name: 'identity-admin', prefix: '/api/v1/admin', target: new URL('/admin', identityUrl()).toString() },
    { name: 'projects', prefix: '/api/v1/projects', target: new URL('/projects', projects).toString() },
    { name: 'projects-catalog', prefix: '/api/v1/catalog', target: new URL('/catalog', projects).toString() },
    { name: 'projects-clients', prefix: '/api/v1/clients', target: new URL('/clients', projects).toString() },
    { name: 'projects-people', prefix: '/api/v1/people', target: new URL('/people', projects).toString() },
    { name: 'platform-evidence', prefix: '/api/v1/evidence', target: new URL('/evidence', requireEnv('PLATFORM_URL')).toString() },
    { name: 'health-assessments', prefix: '/api/v1/assessments', target: new URL('/assessments', requireEnv('HEALTH_URL')).toString() },
  ];
}
