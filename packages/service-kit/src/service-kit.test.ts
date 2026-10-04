import { describe, expect, it } from 'vitest';
import { checkDatabase } from './database.js';
import { portFromEnv, requireEnv } from './env.js';
import { healthReport } from './health.js';

describe('service-kit', () => {
  it('reports database status without throwing', async () => {
    expect(await checkDatabase({ query: async () => ({}) } as never)).toBe('ok');
    expect(await checkDatabase({ query: async () => { throw new Error('down'); } } as never)).toBe('down');
  });

  it('degrades health when the database is down', () => {
    expect(healthReport('x')).toEqual({ service: 'x', status: 'ok' });
    expect(healthReport('x', 'down')).toEqual({ service: 'x', status: 'degraded', database: 'down' });
  });

  it('validates environment values', () => {
    expect(portFromEnv('PHS_TEST_UNSET_PORT', 3000)).toBe(3000);
    process.env.PHS_TEST_BAD_PORT = 'abc';
    expect(() => portFromEnv('PHS_TEST_BAD_PORT', 3000)).toThrow();
    expect(() => requireEnv('PHS_TEST_UNSET_VALUE')).toThrow();
  });
});
