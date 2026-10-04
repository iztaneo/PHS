// Creates a local user. The password comes from the environment, never from the command line.
// Usage: PHS_NEW_USER_EMAIL=... PHS_NEW_USER_NAME=... PHS_NEW_USER_PASSWORD=... [PHS_NEW_USER_ADMIN=true] node dist/cli/create-user.js
import { createPool, loadEnv, requireEnv } from '@phs/service-kit';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../config.js';
import { createLocalUser } from '../users.js';

loadEnv();
const email = requireEnv('PHS_NEW_USER_EMAIL').trim();
const displayName = requireEnv('PHS_NEW_USER_NAME').trim();
const password = requireEnv('PHS_NEW_USER_PASSWORD');
if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
  throw new Error(`The password must have between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`);
}

const pool = createPool(requireEnv('IDENTITY_DATABASE_URL'));
try {
  const isAdmin = process.env.PHS_NEW_USER_ADMIN === 'true';
  const id = await createLocalUser(pool, { email, displayName, password, mustChangePassword: true, isAdmin });
  if (id) {
    console.log(`Usuario creado: ${email}`);
  } else {
    // Existing user: keep its password, only grant the administrator capability when requested.
    if (isAdmin) await pool.query('UPDATE phs.app_user SET is_admin = true WHERE lower(email) = lower($1)', [email]);
    console.log(`El usuario ya existe: ${email}${isAdmin ? ' (ahora es administrador)' : ''}`);
  }
} finally {
  await pool.end();
}
