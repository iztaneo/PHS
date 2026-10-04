import { randomUUID } from 'node:crypto';
import { adminUser, createdUser, newSession, practice as practiceSchema, updatedUser } from '@phs/contracts';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, describe, expect, it } from 'vitest';
import { AdminError, AdminService } from '../src/admin.service.js';
import { AuthService } from '../src/auth.service.js';
import { createLocalUser } from '../src/users.js';

loadEnv();
const url = process.env.IDENTITY_TEST_DATABASE_URL;
const pool = url ? createPool(url) : undefined;
const info = () => ({ requestId: randomUUID() });
const mail = () => `admin-${randomUUID()}@example.invalid`;

afterAll(async () => { await pool?.end(); });

describe.skipIf(!pool)('identity administration', () => {
  const admin = new AdminService(pool!);
  const auth = new AuthService(pool!, { sessionTtlMinutes: 60, sessionIdleMinutes: 30, maxFailedAttempts: 5, lockMinutes: 15 });
  const actor = async () => ({
    userId: (await createLocalUser(pool!, { email: mail(), displayName: 'Admin', password: 'admin-password-123', mustChangePassword: false, isAdmin: true }))!,
    requestId: randomUUID(),
  });

  it('creates a user whose temporary password works once and must be changed', async () => {
    const by = await actor();
    const email = mail();
    const created = await admin.createUser(by, { email, displayName: 'Nueva', isAdmin: false });
    expect(() => createdUser.strict().parse(created)).not.toThrow();
    expect(created.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(created.user).toMatchObject({ email, active: true, isAdmin: false, memberships: [] });
    const session = await auth.login(email, created.temporaryPassword, info());
    expect(session?.user.mustChangePassword).toBe(true);
    await expect(admin.createUser(by, { email: email.toUpperCase(), displayName: 'Otra', isAdmin: false }))
      .rejects.toMatchObject({ code: 'email_taken' });
    const audit = await pool!.query('SELECT * FROM phs.audit_entry WHERE request_id = $1', [by.requestId]);
    expect(audit.rows.map((r) => r.action)).toEqual(['user.created']);
    expect(JSON.stringify(audit.rows)).not.toContain(created.temporaryPassword);
    expect(JSON.stringify(audit.rows)).not.toContain('argon2');
  });

  it('accumulates and removes practice roles, visible in the session', async () => {
    const by = await actor();
    const practice = await admin.createPractice(by, { code: `P${randomUUID().slice(0, 8)}`, name: 'Práctica', timezone: 'America/Mexico_City' });
    const { user, temporaryPassword } = await admin.createUser(by, { email: mail(), displayName: 'Roles', isAdmin: false });
    await admin.setMembership(by, user.id, practice.id, 'pm', true);
    await admin.setMembership(by, user.id, practice.id, 'pm', true);
    expect(() => practiceSchema.strict().parse(practice)).not.toThrow();
    const both = await admin.setMembership(by, user.id, practice.id, 'lead', true);
    expect(() => adminUser.strict().parse(both)).not.toThrow();
    expect(both.memberships.map((m) => m.role)).toEqual(['lead', 'pm']);
    const session = await auth.login(user.email, temporaryPassword, info());
    expect(() => newSession.strict().parse(session)).not.toThrow();
    expect(session?.user.memberships).toEqual([
      { practiceId: practice.id, practiceName: 'Práctica', role: 'lead' },
      { practiceId: practice.id, practiceName: 'Práctica', role: 'pm' },
    ]);
    const one = await admin.setMembership(by, user.id, practice.id, 'pm', false);
    expect(one.memberships.map((m) => m.role)).toEqual(['lead']);
    await expect(admin.setMembership(by, user.id, randomUUID(), 'pm', true)).rejects.toBeInstanceOf(AdminError);
    await expect(admin.createPractice(by, { code: practice.code, name: 'Dup', timezone: 'America/Mexico_City' }))
      .rejects.toMatchObject({ code: 'code_taken' });
    await expect(admin.createPractice(by, { code: `P${randomUUID().slice(0, 8)}`, name: 'TZ', timezone: 'Not/AZone' }))
      .rejects.toMatchObject({ code: 'invalid_timezone' });
  });

  it('disabling a user ends its sessions and keeps its history', async () => {
    const by = await actor();
    const { user, temporaryPassword } = await admin.createUser(by, { email: mail(), displayName: 'Baja', isAdmin: false });
    const session = await auth.login(user.email, temporaryPassword, info());
    const result = await admin.updateUser(by, user.id, { active: false });
    expect(() => updatedUser.strict().parse(result)).not.toThrow();
    expect(result.user.active).toBe(false);
    expect(result.responsibilities).toEqual({ projectsAsPm: 0, projectsAsLead: 0, projectsAsTechnicalOwner: 0 });
    expect(await auth.introspect(session!.token)).toBeNull();
    expect(await auth.login(user.email, temporaryPassword, info())).toBeNull();
    expect((await admin.listUsers()).some((u) => u.id === user.id)).toBe(true);
  });

  it('resetting a password invalidates the old one and the open sessions', async () => {
    const by = await actor();
    const { user, temporaryPassword } = await admin.createUser(by, { email: mail(), displayName: 'Reset', isAdmin: false });
    const session = await auth.login(user.email, temporaryPassword, info());
    const reset = await admin.resetPassword(by, user.id);
    expect(reset.temporaryPassword).not.toBe(temporaryPassword);
    expect(await auth.introspect(session!.token)).toBeNull();
    expect(await auth.login(user.email, temporaryPassword, info())).toBeNull();
    expect((await auth.login(user.email, reset.temporaryPassword, info()))?.user.mustChangePassword).toBe(true);
    await expect(admin.resetPassword(by, randomUUID())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('never leaves the system without an active administrator', async () => {
    const by = await actor();
    // Other tests create administrators too; disable every other one inside this check only.
    const others = await pool!.query<{ id: string }>('SELECT id FROM phs.app_user WHERE is_admin AND active AND id <> $1', [by.userId]);
    await pool!.query('UPDATE phs.app_user SET active = false WHERE id = ANY($1)', [others.rows.map((r) => r.id)]);
    try {
      await expect(admin.updateUser(by, by.userId, { isAdmin: false })).rejects.toMatchObject({ code: 'last_admin' });
      await expect(admin.updateUser(by, by.userId, { active: false })).rejects.toMatchObject({ code: 'last_admin' });
      const second = await admin.createUser(by, { email: mail(), displayName: 'Segundo', isAdmin: true });
      expect((await admin.updateUser(by, by.userId, { isAdmin: false })).user.isAdmin).toBe(false);
      await expect(admin.updateUser(by, second.user.id, { active: false })).rejects.toMatchObject({ code: 'last_admin' });
    } finally {
      await pool!.query('UPDATE phs.app_user SET active = true WHERE id = ANY($1)', [others.rows.map((r) => r.id)]);
    }
  });
});
