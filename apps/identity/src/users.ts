import type pg from 'pg';
import { hashPassword } from './passwords.js';

export interface NewUser {
  email: string;
  displayName: string;
  password: string;
  mustChangePassword: boolean;
}

// Creates a local user with its credential. Returns null when the email is already registered.
export async function createLocalUser(pool: pg.Pool, user: NewUser): Promise<string | null> {
  const passwordHash = await hashPassword(user.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM phs.app_user WHERE lower(email) = lower($1)', [user.email]);
    if (exists.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id',
      [user.displayName, user.email],
    );
    const id = inserted.rows[0]!.id;
    await client.query(
      'INSERT INTO phs.user_credential(user_id, password_hash, must_change_password) VALUES($1, $2, $3)',
      [id, passwordHash, user.mustChangePassword],
    );
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
