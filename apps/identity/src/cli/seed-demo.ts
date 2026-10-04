// Loads demo users, practices and roles for local testing. Safe to run again: existing rows are kept.
// Requires the development administrator (pnpm seed:dev) and DEMO_USER_PASSWORD in the environment.
import { randomUUID } from 'node:crypto';
import { createPool, loadEnv, requireEnv, type PracticeRole } from '@phs/service-kit';
import { AdminService } from '../admin.service.js';
import { createLocalUser } from '../users.js';

loadEnv();
const password = requireEnv('DEMO_USER_PASSWORD');
const adminEmail = requireEnv('DEV_USER_EMAIL');
const pool = createPool(requireEnv('IDENTITY_DATABASE_URL'));

const PRACTICES = [
  { code: 'CONS', name: 'Consultoría y desarrollo' },
  { code: 'DATA', name: 'Datos e IA' },
];
// Roles per practice code. The administrator also gets business roles so one login shows everything.
const USERS: { email: string; name: string; roles: [string, PracticeRole][] }[] = [
  { email: 'ana.pm@phs.test', name: 'Ana Torres (PM)', roles: [['CONS', 'pm']] },
  { email: 'luis.lider@phs.test', name: 'Luis Herrera (Líder)', roles: [['CONS', 'lead']] },
  { email: 'carla.direccion@phs.test', name: 'Carla Méndez (Dirección)', roles: [['CONS', 'director'], ['DATA', 'director']] },
  { email: 'pablo.pm@phs.test', name: 'Pablo Ríos (PM y líder de Datos)', roles: [['DATA', 'pm'], ['DATA', 'lead']] },
  { email: 'diego.dev@phs.test', name: 'Diego Salas (Desarrollo)', roles: [] },
  { email: 'elena.lectora@phs.test', name: 'Elena Cruz (Cliente interno)', roles: [] },
];

try {
  const admin = new AdminService(pool);
  const found = await pool.query<{ id: string }>('SELECT id FROM phs.app_user WHERE lower(email) = lower($1)', [adminEmail]);
  const adminId = found.rows[0]?.id;
  if (!adminId) throw new Error(`No existe ${adminEmail}. Ejecuta primero: pnpm seed:dev`);
  const actor = () => ({ userId: adminId, requestId: randomUUID() });

  const practiceIds = new Map((await admin.listPractices()).map((p) => [p.code, p.id]));
  for (const practice of PRACTICES) {
    if (!practiceIds.has(practice.code)) {
      practiceIds.set(practice.code, (await admin.createPractice(actor(), { ...practice, timezone: 'America/Mexico_City' })).id);
      console.log(`Práctica creada: ${practice.name}`);
    }
  }

  for (const user of USERS) {
    const created = await createLocalUser(pool, { email: user.email, displayName: user.name, password, mustChangePassword: false });
    if (created) console.log(`Usuario creado: ${user.email}`);
  }
  const ids = new Map((await admin.listUsers()).map((u) => [u.email, u.id]));
  const grants: [string, string, PracticeRole][] = [
    ...USERS.flatMap((u) => u.roles.map(([code, role]) => [u.email, code, role] as [string, string, PracticeRole])),
    [adminEmail, 'CONS', 'pm'], [adminEmail, 'CONS', 'lead'], [adminEmail, 'DATA', 'director'],
  ];
  for (const [email, code, role] of grants) {
    await admin.setMembership(actor(), ids.get(email)!, practiceIds.get(code)!, role, true);
  }
  console.log(`Usuarios de demostración listos: ${USERS.map((u) => u.email).join(', ')}`);
} finally {
  await pool.end();
}
