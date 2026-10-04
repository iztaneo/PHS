import { randomBytes } from 'node:crypto';
import { insertAudit, withTransaction, type PracticeRole } from '@phs/service-kit';
import type pg from 'pg';
import { hashPassword } from './passwords.js';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  isAdmin: boolean;
  memberships: { practiceId: string; practiceName: string; role: PracticeRole }[];
}

export interface Practice {
  id: string;
  code: string;
  name: string;
  timezone: string;
}

// Active responsibilities that need a new owner when a user is disabled.
export interface Responsibilities {
  projectsAsPm: number;
  projectsAsLead: number;
  projectsAsTechnicalOwner: number;
}

export interface Actor {
  userId: string;
  requestId: string;
}

export class AdminError extends Error {
  constructor(readonly code: 'not_found' | 'email_taken' | 'code_taken' | 'last_admin' | 'invalid_timezone') {
    super(code);
  }
}

function temporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

const USER_SELECT = `
  SELECT u.id, u.email, u.display_name, u.active, u.is_admin,
         coalesce(json_agg(json_build_object('practiceId', m.practice_id, 'practiceName', p.name, 'role', m.role)
                           ORDER BY p.name, m.role) FILTER (WHERE m.user_id IS NOT NULL), '[]') AS memberships
    FROM phs.app_user u
    LEFT JOIN phs.practice_membership m ON m.user_id = u.id
    LEFT JOIN phs.practice p ON p.id = m.practice_id`;

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
  is_admin: boolean;
  memberships: AdminUser['memberships'];
}

function toUser(row: UserRow): AdminUser {
  return {
    id: row.id, email: row.email, displayName: row.display_name, active: row.active,
    isAdmin: row.is_admin, memberships: row.memberships,
  };
}

export class AdminService {
  constructor(private readonly pool: pg.Pool) {}

  async listUsers(): Promise<AdminUser[]> {
    const found = await this.pool.query<UserRow>(`${USER_SELECT} GROUP BY u.id ORDER BY lower(u.email)`);
    return found.rows.map(toUser);
  }

  private async getUser(client: pg.PoolClient | pg.Pool, id: string): Promise<AdminUser> {
    const found = await client.query<UserRow>(`${USER_SELECT} WHERE u.id = $1 GROUP BY u.id`, [id]);
    const row = found.rows[0];
    if (!row) throw new AdminError('not_found');
    return toUser(row);
  }

  // The temporary password is returned once and cannot be read again.
  async createUser(
    actor: Actor,
    input: { email: string; displayName: string; isAdmin: boolean },
  ): Promise<{ user: AdminUser; temporaryPassword: string }> {
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    const user = await withTransaction(this.pool, async (client) => {
      const exists = await client.query('SELECT 1 FROM phs.app_user WHERE lower(email) = lower($1)', [input.email]);
      if (exists.rowCount) throw new AdminError('email_taken');
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO phs.app_user(display_name, email, is_admin) VALUES($1, $2, $3) RETURNING id',
        [input.displayName, input.email, input.isAdmin],
      );
      const id = inserted.rows[0]!.id;
      await client.query(
        'INSERT INTO phs.user_credential(user_id, password_hash, must_change_password, created_by) VALUES($1, $2, true, $3)',
        [id, passwordHash, actor.userId],
      );
      await insertAudit(client, {
        ...actor, actorId: actor.userId, action: 'user.created', entityType: 'app_user', entityId: id,
        after: { email: input.email, displayName: input.displayName, isAdmin: input.isAdmin },
      });
      return this.getUser(client, id);
    });
    return { user, temporaryPassword: password };
  }

  async updateUser(
    actor: Actor,
    id: string,
    changes: { displayName?: string; active?: boolean; isAdmin?: boolean },
  ): Promise<{ user: AdminUser; responsibilities?: Responsibilities }> {
    return withTransaction(this.pool, async (client) => {
      // Serialises changes to the set of administrators so two requests cannot remove the last one.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('phs.admin_set'))");
      const before = await this.getUser(client, id);
      const next = {
        displayName: changes.displayName ?? before.displayName,
        active: changes.active ?? before.active,
        isAdmin: changes.isAdmin ?? before.isAdmin,
      };
      if (before.isAdmin && before.active && !(next.isAdmin && next.active)) {
        const others = await client.query(
          'SELECT 1 FROM phs.app_user WHERE is_admin AND active AND id <> $1 LIMIT 1', [id]);
        if (!others.rowCount) throw new AdminError('last_admin');
      }
      await client.query('UPDATE phs.app_user SET display_name = $2, active = $3, is_admin = $4 WHERE id = $1',
        [id, next.displayName, next.active, next.isAdmin]);
      let responsibilities: Responsibilities | undefined;
      if (before.active && !next.active) {
        await client.query(
          `UPDATE phs.user_session SET revoked_at = now(), revoke_reason = 'user_disabled'
            WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
        const open = await client.query<{ pm: string; lead: string; technical: string }>(
          `SELECT count(*) FILTER (WHERE pm_id = $1) AS pm, count(*) FILTER (WHERE lead_id = $1) AS lead,
                  count(*) FILTER (WHERE technical_owner_id = $1) AS technical
             FROM phs.project WHERE status <> 'closed'`, [id]);
        const counts = open.rows[0]!;
        responsibilities = {
          projectsAsPm: Number(counts.pm), projectsAsLead: Number(counts.lead),
          projectsAsTechnicalOwner: Number(counts.technical),
        };
      }
      await insertAudit(client, {
        ...actor, actorId: actor.userId, action: 'user.updated', entityType: 'app_user', entityId: id,
        before: { displayName: before.displayName, active: before.active, isAdmin: before.isAdmin },
        after: next,
      });
      return { user: await this.getUser(client, id), responsibilities };
    });
  }

  async resetPassword(actor: Actor, id: string): Promise<{ temporaryPassword: string }> {
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    await withTransaction(this.pool, async (client) => {
      await this.getUser(client, id);
      await client.query(
        `INSERT INTO phs.user_credential(user_id, password_hash, must_change_password, created_by)
         VALUES($1, $2, true, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET password_hash = excluded.password_hash, must_change_password = true, password_changed_at = now(),
               failed_attempts = 0, locked_until = NULL`,
        [id, passwordHash, actor.userId],
      );
      await client.query(
        `UPDATE phs.user_session SET revoked_at = now(), revoke_reason = 'admin'
          WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
      await insertAudit(client, {
        ...actor, actorId: actor.userId, action: 'credential.reset', entityType: 'app_user', entityId: id,
      });
    });
    return { temporaryPassword: password };
  }

  async listPractices(): Promise<Practice[]> {
    const found = await this.pool.query<Practice>('SELECT id, code, name, timezone FROM phs.practice ORDER BY name');
    return found.rows;
  }

  private async assertTimezone(client: pg.PoolClient, timezone: string): Promise<void> {
    const known = await client.query('SELECT 1 FROM pg_timezone_names WHERE name = $1', [timezone]);
    if (!known.rowCount) throw new AdminError('invalid_timezone');
  }

  async createPractice(actor: Actor, input: { code: string; name: string; timezone: string }): Promise<Practice> {
    return withTransaction(this.pool, async (client) => {
      await this.assertTimezone(client, input.timezone);
      const exists = await client.query('SELECT 1 FROM phs.practice WHERE code = $1', [input.code]);
      if (exists.rowCount) throw new AdminError('code_taken');
      const inserted = await client.query<Practice>(
        'INSERT INTO phs.practice(code, name, timezone) VALUES($1, $2, $3) RETURNING id, code, name, timezone',
        [input.code, input.name, input.timezone],
      );
      const practice = inserted.rows[0]!;
      await insertAudit(client, {
        ...actor, actorId: actor.userId, action: 'practice.created', entityType: 'practice', entityId: practice.id,
        after: { ...input },
      });
      return practice;
    });
  }

  async setMembership(actor: Actor, userId: string, practiceId: string, role: PracticeRole, granted: boolean): Promise<AdminUser> {
    return withTransaction(this.pool, async (client) => {
      await this.getUser(client, userId);
      const practice = await client.query('SELECT 1 FROM phs.practice WHERE id = $1', [practiceId]);
      if (!practice.rowCount) throw new AdminError('not_found');
      const changed = granted
        ? await client.query(
            'INSERT INTO phs.practice_membership(practice_id, user_id, role) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
            [practiceId, userId, role])
        : await client.query(
            'DELETE FROM phs.practice_membership WHERE practice_id = $1 AND user_id = $2 AND role = $3',
            [practiceId, userId, role]);
      if (changed.rowCount) {
        await insertAudit(client, {
          ...actor, actorId: actor.userId, action: granted ? 'membership.granted' : 'membership.revoked',
          entityType: 'app_user', entityId: userId, after: { practiceId, role },
        });
      }
      return this.getUser(client, userId);
    });
  }
}
