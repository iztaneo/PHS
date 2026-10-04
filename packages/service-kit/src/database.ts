import pg from 'pg';

export const PG_POOL = Symbol('PG_POOL');
export type DatabaseStatus = 'ok' | 'down';

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 2000 });
  // An idle client losing its connection must not crash the service; the next query reconnects.
  pool.on('error', (error) => console.error('PostgreSQL idle client error:', error.message));
  return pool;
}

export async function checkDatabase(pool: Pick<pg.Pool, 'query'>): Promise<DatabaseStatus> {
  try {
    await pool.query('SELECT 1');
    return 'ok';
  } catch {
    return 'down';
  }
}
