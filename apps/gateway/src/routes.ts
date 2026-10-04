import { requireEnv } from '@phs/service-kit';

export interface ServiceRoute {
  name: string;
  prefix: string;
  target: string;
}

// Public prefix -> internal service. Health and Platform are added when those services exist.
export function serviceRoutes(): ServiceRoute[] {
  return [
    { name: 'identity', prefix: '/api/v1/identity', target: requireEnv('IDENTITY_URL') },
    { name: 'projects', prefix: '/api/v1/projects', target: requireEnv('PROJECTS_URL') },
  ];
}
