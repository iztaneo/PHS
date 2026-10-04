import pg from 'pg';

export const PG_POOL = Symbol('PG_POOL');
export type DatabaseStatus = 'ok' | 'down';

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 2000 });
  // An idle client losing its connection must not crash the service; the next query reconnects.
  pool.on('error', (error) => console.error('PostgreSQL idle client error:', error.message));
  return pool;
}

export async function withTransaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface AuditRecord {
  requestId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// Written in the same transaction as the change it records. Never pass passwords, tokens or hashes.
export async function insertAudit(client: pg.PoolClient, record: AuditRecord): Promise<void> {
  await client.query(
    `INSERT INTO phs.audit_entry(actor_id, request_id, action, entity_type, entity_id, before_data, after_data)
     VALUES($1, $2, $3, $4, $5, $6, $7)`,
    [record.actorId, record.requestId, record.action, record.entityType, record.entityId,
      record.before ? JSON.stringify(record.before) : null, record.after ? JSON.stringify(record.after) : null],
  );
}

export interface UserAccess {
  active: boolean;
  isAdmin: boolean;
  memberships: { practiceId: string; role: 'pm' | 'lead' | 'director' }[];
}

// Read on every request so a change of access applies to the next one.
export async function loadAccess(pool: Pick<pg.Pool, 'query'>, userId: string): Promise<UserAccess | null> {
  const user = await pool.query<{ active: boolean; is_admin: boolean }>(
    'SELECT active, is_admin FROM phs.app_user WHERE id = $1', [userId]);
  const row = user.rows[0];
  if (!row) return null;
  const memberships = await pool.query<{ practice_id: string; role: 'pm' | 'lead' | 'director' }>(
    'SELECT practice_id, role FROM phs.practice_membership WHERE user_id = $1', [userId]);
  return {
    active: row.active,
    isAdmin: row.is_admin,
    memberships: memberships.rows.map((m) => ({ practiceId: m.practice_id, role: m.role })),
  };
}

export async function checkDatabase(pool: Pick<pg.Pool, 'query'>): Promise<DatabaseStatus> {
  try {
    await pool.query('SELECT 1');
    return 'ok';
  } catch {
    return 'down';
  }
}
