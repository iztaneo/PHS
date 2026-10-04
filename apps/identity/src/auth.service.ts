import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type AuthConfig } from './config.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './passwords.js';

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  mustChangePassword: boolean;
}

export interface SessionInfo {
  sessionId: string;
  expiresAt: string;
  user: SessionUser;
}

export interface NewSession extends SessionInfo {
  token: string;
}

export interface ClientInfo {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export type PasswordChangeResult = 'ok' | 'invalid_session' | 'invalid_current' | 'weak_password';

const LAST_SEEN_REFRESH_SECONDS = 60;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function audit(
  client: pg.PoolClient,
  requestId: string,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
): Promise<unknown> {
  // Never pass tokens, passwords or hashes here.
  return client.query(
    'INSERT INTO phs.audit_entry(actor_id, request_id, action, entity_type, entity_id) VALUES($1, $2, $3, $4, $5)',
    [actorId, requestId, action, entityType, entityId],
  );
}

export class AuthService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly config: AuthConfig,
  ) {}

  // Returns null for every failure so the caller cannot tell which check failed.
  async login(email: string, password: string, info: ClientInfo): Promise<NewSession | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        id: string;
        display_name: string;
        email: string;
        active: boolean;
        password_hash: string;
        must_change_password: boolean;
        failed_attempts: number;
        locked: boolean;
      }>(
        `SELECT u.id, u.display_name, u.email, u.active, c.password_hash, c.must_change_password,
                c.failed_attempts, coalesce(c.locked_until > now(), false) AS locked
           FROM phs.app_user u JOIN phs.user_credential c ON c.user_id = u.id
          WHERE lower(u.email) = lower($1)
            FOR UPDATE OF c`,
        [email],
      );
      const row = found.rows[0];
      if (!row || !row.active || row.locked) {
        await verifyAgainstDummy(password);
        await client.query('ROLLBACK');
        return null;
      }
      if (!(await verifyPassword(row.password_hash, password))) {
        const attempts = row.failed_attempts + 1;
        const lock = attempts >= this.config.maxFailedAttempts;
        await client.query(
          `UPDATE phs.user_credential
              SET failed_attempts = $2,
                  locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END
            WHERE user_id = $1`,
          [row.id, lock ? 0 : attempts, lock, this.config.lockMinutes],
        );
        await audit(client, info.requestId, null, lock ? 'session.locked' : 'session.login_failed', 'app_user', row.id);
        await client.query('COMMIT');
        return null;
      }
      await client.query(
        'UPDATE phs.user_credential SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE user_id = $1',
        [row.id],
      );
      const token = randomBytes(32).toString('base64url');
      const session = await client.query<{ id: string; expires_at: Date }>(
        `INSERT INTO phs.user_session(user_id, token_hash, expires_at, ip_address, user_agent)
         VALUES($1, $2, now() + make_interval(mins => $3), $4, $5)
         RETURNING id, expires_at`,
        [row.id, hashToken(token), this.config.sessionTtlMinutes, info.ipAddress ?? null, info.userAgent ?? null],
      );
      const created = session.rows[0]!;
      await audit(client, info.requestId, row.id, 'session.login', 'user_session', created.id);
      await client.query('COMMIT');
      return {
        token,
        sessionId: created.id,
        expiresAt: created.expires_at.toISOString(),
        user: { id: row.id, displayName: row.display_name, email: row.email, mustChangePassword: row.must_change_password },
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async introspect(token: string): Promise<SessionInfo | null> {
    const found = await this.pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      stale: boolean;
      display_name: string;
      email: string;
      active: boolean;
      must_change_password: boolean;
    }>(
      `SELECT s.id, s.user_id, s.expires_at,
              s.last_seen_at < now() - make_interval(secs => $3) AS stale,
              u.display_name, u.email, u.active, c.must_change_password
         FROM phs.user_session s
         JOIN phs.app_user u ON u.id = s.user_id
         JOIN phs.user_credential c ON c.user_id = u.id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
          AND s.last_seen_at > now() - make_interval(mins => $2)`,
      [hashToken(token), this.config.sessionIdleMinutes, LAST_SEEN_REFRESH_SECONDS],
    );
    const row = found.rows[0];
    if (!row) return null;
    if (!row.active) {
      await this.pool.query(
        `UPDATE phs.user_session SET revoked_at = now(), revoke_reason = 'user_disabled'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id],
      );
      return null;
    }
    if (row.stale) {
      await this.pool.query('UPDATE phs.user_session SET last_seen_at = now() WHERE id = $1', [row.id]);
    }
    return {
      sessionId: row.id,
      expiresAt: row.expires_at.toISOString(),
      user: { id: row.user_id, displayName: row.display_name, email: row.email, mustChangePassword: row.must_change_password },
    };
  }

  async revoke(token: string, requestId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query<{ id: string; user_id: string }>(
        `UPDATE phs.user_session SET revoked_at = now(), revoke_reason = 'logout'
          WHERE token_hash = $1 AND revoked_at IS NULL
          RETURNING id, user_id`,
        [hashToken(token)],
      );
      const row = revoked.rows[0];
      if (row) await audit(client, requestId, row.user_id, 'session.logout', 'user_session', row.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
    requestId: string,
  ): Promise<PasswordChangeResult> {
    const session = await this.introspect(token);
    if (!session) return 'invalid_session';
    if (
      newPassword.length < PASSWORD_MIN_LENGTH ||
      newPassword.length > PASSWORD_MAX_LENGTH ||
      newPassword === currentPassword
    ) {
      return 'weak_password';
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const credential = await client.query<{ password_hash: string }>(
        'SELECT password_hash FROM phs.user_credential WHERE user_id = $1 FOR UPDATE',
        [session.user.id],
      );
      const row = credential.rows[0];
      if (!row || !(await verifyPassword(row.password_hash, currentPassword))) {
        await client.query('ROLLBACK');
        return 'invalid_current';
      }
      await client.query(
        `UPDATE phs.user_credential
            SET password_hash = $2, must_change_password = false, password_changed_at = now(),
                failed_attempts = 0, locked_until = NULL
          WHERE user_id = $1`,
        [session.user.id, await hashPassword(newPassword)],
      );
      await client.query(
        `UPDATE phs.user_session SET revoked_at = now(), revoke_reason = 'password_change'
          WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
        [session.user.id, session.sessionId],
      );
      await audit(client, requestId, session.user.id, 'credential.password_changed', 'app_user', session.user.id);
      await client.query('COMMIT');
      return 'ok';
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
