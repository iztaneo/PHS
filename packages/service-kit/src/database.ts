import { createHash } from 'node:crypto';
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
  projectId?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// Written in the same transaction as the change it records. Never pass passwords, tokens or hashes.
export async function insertAudit(client: pg.PoolClient, record: AuditRecord): Promise<void> {
  await client.query(
    `INSERT INTO phs.audit_entry(actor_id, request_id, action, entity_type, entity_id, before_data, after_data, project_id)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
    [record.actorId, record.requestId, record.action, record.entityType, record.entityId,
      record.before ? JSON.stringify(record.before) : null, record.after ? JSON.stringify(record.after) : null, record.projectId ?? null],
  );
}

export interface OutboxMessage {
  projectId: string | null;
  eventType: string;
  // Stable per fact, so a retry cannot publish the same event twice.
  deduplicationKey: string;
  payload: Record<string, unknown>;
}

// Written in the same transaction as the change; the Platform service dispatches it later.
export async function insertOutbox(client: pg.PoolClient, message: OutboxMessage): Promise<void> {
  await client.query(
    'INSERT INTO phs.outbox_message(project_id, event_type, deduplication_key, payload) VALUES($1, $2, $3, $4)',
    [message.projectId, message.eventType, message.deduplicationKey, JSON.stringify(message.payload)],
  );
}

export interface IdempotentCommand {
  service: 'identity' | 'projects' | 'health' | 'platform';
  userId: string;
  key: string;
  command: string;
  // Everything that defines the request; a different payload under the same key is rejected.
  payload: unknown;
}

export interface CommandResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export class IdempotencyKeyReused extends Error {
  constructor() {
    super('idempotency_key_reused');
  }
}

// Runs `work` once per (service, user, key). A retry with the same payload returns the stored
// result without running it again. Must be called inside the command's transaction, so the
// result is stored only if the command commits.
export async function runIdempotent<T>(
  client: pg.PoolClient,
  command: IdempotentCommand,
  work: () => Promise<{ status: number; body: T }>,
): Promise<CommandResult<T>> {
  const hash = createHash('sha256').update(JSON.stringify([command.command, command.payload])).digest('hex');
  // Concurrent retries of the same key wait here until the first one commits.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`${command.service}:${command.userId}:${command.key}`]);
  const stored = await client.query<{ request_hash: string; response_status: number; response_body: T }>(
    'SELECT request_hash, response_status, response_body FROM phs.command_idempotency WHERE service = $1 AND user_id = $2 AND key = $3',
    [command.service, command.userId, command.key],
  );
  const previous = stored.rows[0];
  if (previous) {
    if (previous.request_hash !== hash) throw new IdempotencyKeyReused();
    return { status: previous.response_status, body: previous.response_body, replayed: true };
  }
  const result = await work();
  await client.query(
    `INSERT INTO phs.command_idempotency(service, user_id, key, command, request_hash, response_status, response_body)
     VALUES($1, $2, $3, $4, $5, $6, $7)`,
    [command.service, command.userId, command.key, command.command, hash, result.status, JSON.stringify(result.body)],
  );
  return { ...result, replayed: false };
}

export interface UserAccess {
  active: boolean;
  isAdmin: boolean;
  memberships: { practiceId: string; role: 'pm' | 'lead' | 'director' }[];
}

// Read on every request so a change of access applies to the next one.
export async function loadAccess(pool: Pick<pg.Pool | pg.PoolClient, 'query'>, userId: string): Promise<UserAccess | null> {
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
