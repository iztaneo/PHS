import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusService } from '../src/status.service.js';

const routes = [
  { name: 'identity', prefix: '/api/v1/identity', target: 'http://identity.test' },
  { name: 'projects', prefix: '/api/v1/projects', target: 'http://projects.test' },
];

afterEach(() => vi.unstubAllGlobals());

describe('gateway status', () => {
  it('is ok when every service is ok', async () => {
    vi.stubGlobal('fetch', async (url: URL) =>
      Response.json({ service: url.hostname, status: 'ok', database: 'ok' }));
    const status = await new StatusService(routes).check();
    expect(status.status).toBe('ok');
    expect(status.services.map((s) => s.service)).toEqual(['identity', 'projects']);
  });

  it('is degraded when a service is unreachable or degraded', async () => {
    vi.stubGlobal('fetch', async (url: URL) => {
      if (url.hostname === 'identity.test') throw new Error('refused');
      return Response.json({ service: 'projects', status: 'degraded', database: 'down' });
    });
    const status = await new StatusService(routes).check();
    expect(status).toEqual({
      status: 'degraded',
      services: [
        { service: 'identity', status: 'unreachable' },
        { service: 'projects', status: 'degraded', database: 'down' },
      ],
    });
  });
});
