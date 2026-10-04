import { randomUUID } from 'node:crypto';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth.service.js';
import { createLocalUser } from '../src/users.js';

// Integration tests against the local test database (pnpm db:test:setup). Skipped when it is not configured.
loadEnv();
const url = process.env.IDENTITY_TEST_DATABASE_URL;
const pool = url ? createPool(url) : undefined;
const config = { sessionTtlMinutes: 60, sessionIdleMinutes: 30, maxFailedAttempts: 3, lockMinutes: 15 };
const info = () => ({ requestId: randomUUID(), ipAddress: '127.0.0.1', userAgent: 'vitest' });
const PASSWORD = 'correct-horse-battery';

async function newUser(mustChangePassword = false): Promise<string> {
  const email = `test-${randomUUID()}@example.invalid`;
  await createLocalUser(pool!, { email, displayName: 'Test', password: PASSWORD, mustChangePassword });
  return email;
}

afterAll(async () => { await pool?.end(); });

describe.skipIf(!pool)('identity authentication', () => {
  const auth = new AuthService(pool!, config);

  it('logs in case-insensitively and stores only the token hash', async () => {
    const email = await newUser(true);
    const session = await auth.login(email.toUpperCase(), PASSWORD, info());
    expect(session?.user.email).toBe(email);
    expect(session?.user.mustChangePassword).toBe(true);
    const stored = await pool!.query('SELECT token_hash FROM phs.user_session WHERE id = $1', [session!.sessionId]);
    expect(stored.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0].token_hash).not.toBe(session!.token);
    expect((await auth.introspect(session!.token))?.user.email).toBe(email);
  });

  it('rejects unknown users and wrong passwords the same way', async () => {
    const email = await newUser();
    expect(await auth.login(`missing-${randomUUID()}@example.invalid`, PASSWORD, info())).toBeNull();
    expect(await auth.login(email, 'wrong-password-123', info())).toBeNull();
    expect(await auth.login(email, PASSWORD, info())).not.toBeNull();
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const email = await newUser();
    for (let i = 0; i < config.maxFailedAttempts; i += 1) {
      expect(await auth.login(email, 'wrong-password-123', info())).toBeNull();
    }
    expect(await auth.login(email, PASSWORD, info())).toBeNull();
    await pool!.query(
      `UPDATE phs.user_credential SET locked_until = now() - interval '1 second'
        WHERE user_id = (SELECT id FROM phs.app_user WHERE email = $1)`, [email]);
    expect(await auth.login(email, PASSWORD, info())).not.toBeNull();
  });

  it('revokes a session on logout', async () => {
    const session = await auth.login(await newUser(), PASSWORD, info());
    await auth.revoke(session!.token, randomUUID());
    expect(await auth.introspect(session!.token)).toBeNull();
    expect(await auth.introspect('not-a-token')).toBeNull();
  });

  it('expires idle sessions and sessions of disabled users', async () => {
    const email = await newUser();
    const idle = await auth.login(email, PASSWORD, info());
    await pool!.query(
      `UPDATE phs.user_session SET created_at = now() - interval '2 hours', last_seen_at = now() - interval '1 hour'
        WHERE id = $1`, [idle!.sessionId]);
    expect(await auth.introspect(idle!.token)).toBeNull();
    const active = await auth.login(email, PASSWORD, info());
    await pool!.query('UPDATE phs.app_user SET active = false WHERE email = $1', [email]);
    expect(await auth.introspect(active!.token)).toBeNull();
    expect(await auth.login(email, PASSWORD, info())).toBeNull();
  });

  it('changes the password, clears the flag and revokes the other sessions', async () => {
    const email = await newUser(true);
    const first = await auth.login(email, PASSWORD, info());
    const second = await auth.login(email, PASSWORD, info());
    const next = 'another-long-password';
    expect(await auth.changePassword(second!.token, 'wrong-password-123', next, randomUUID())).toBe('invalid_current');
    expect(await auth.changePassword(second!.token, PASSWORD, 'short', randomUUID())).toBe('weak_password');
    expect(await auth.changePassword(second!.token, PASSWORD, PASSWORD, randomUUID())).toBe('weak_password');
    expect(await auth.changePassword('not-a-token', PASSWORD, next, randomUUID())).toBe('invalid_session');
    expect(await auth.changePassword(second!.token, PASSWORD, next, randomUUID())).toBe('ok');
    expect(await auth.introspect(first!.token)).toBeNull();
    expect((await auth.introspect(second!.token))?.user.mustChangePassword).toBe(false);
    expect(await auth.login(email, PASSWORD, info())).toBeNull();
    expect(await auth.login(email, next, info())).not.toBeNull();
  });

  it('audits without storing secrets', async () => {
    const email = await newUser();
    const requestId = randomUUID();
    const session = await auth.login(email, PASSWORD, { requestId });
    const rows = await pool!.query('SELECT * FROM phs.audit_entry WHERE request_id = $1', [requestId]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].action).toBe('session.login');
    const text = JSON.stringify(rows.rows);
    expect(text).not.toContain(session!.token);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain('argon2');
  });
});
