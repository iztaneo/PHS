// Creates a local user. The password comes from the environment, never from the command line.
// Usage: PHS_NEW_USER_EMAIL=... PHS_NEW_USER_NAME=... PHS_NEW_USER_PASSWORD=... node dist/cli/create-user.js
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
  const id = await createLocalUser(pool, { email, displayName, password, mustChangePassword: true });
  console.log(id ? `Usuario creado: ${email}` : `El usuario ya existe: ${email}`);
} finally {
  await pool.end();
}
