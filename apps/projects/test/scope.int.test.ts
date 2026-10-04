import { randomUUID } from 'node:crypto';
import { projectSummary, serviceType } from '@phs/contracts';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogService } from '../src/catalog.service.js';
import { ProjectsService } from '../src/projects.service.js';

// Fixtures are created with the schema owner; the service under test uses the restricted Projects role.
loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.PROJECTS_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;

async function one<T>(sql: string, params: unknown[]): Promise<T> {
  return (await owner!.query(sql, params)).rows[0].id as T;
}
const user = (name: string, admin = false) =>
  one<string>('INSERT INTO phs.app_user(display_name, email, is_admin) VALUES($1, $2, $3) RETURNING id',
    [name, `${name}-${randomUUID()}@example.invalid`, admin]);
const practice = (name: string) =>
  one<string>('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`S${randomUUID().slice(0, 8)}`, name]);
const member = (practiceId: string, userId: string, role: string) =>
  owner!.query('INSERT INTO phs.practice_membership(practice_id, user_id, role) VALUES($1, $2, $3)', [practiceId, userId, role]);

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('project scope by role (D05)', () => {
  const service = new ProjectsService(pool!);
  const u: Record<string, string> = {};
  let practiceA = ''; let practiceB = ''; let projectA = ''; let projectA2 = ''; let projectB = '';

  beforeAll(async () => {
    practiceA = await practice('A'); practiceB = await practice('B');
    for (const name of ['pmA', 'pmA2', 'pmB', 'leadA', 'directorA', 'admin', 'member', 'riskOwner', 'sponsor', 'disabled', 'tech']) {
      u[name] = await user(name, name === 'admin');
    }
    await member(practiceA, u.pmA!, 'pm'); await member(practiceA, u.pmA2!, 'pm'); await member(practiceB, u.pmB!, 'pm');
    await member(practiceA, u.leadA!, 'lead'); await member(practiceA, u.directorA!, 'director');
    await member(practiceA, u.disabled!, 'lead');
    await owner!.query('UPDATE phs.app_user SET active = false WHERE id = $1', [u.disabled]);
    const client = await one<string>('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
    const project = (practiceId: string, pm: string, lead: string, name: string, sponsor: string | null = null) =>
      one<string>(
        `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, sponsor_id, starts_on, ends_on)
         VALUES($1, $2, $3, $4, 'development', $5, $6, $7, $8, '2026-01-01', '2026-12-31') RETURNING id`,
        [practiceId, client, `S-${randomUUID().slice(0, 8)}`, name, pm, lead, u.tech, sponsor]);
    projectA = await project(practiceA, u.pmA!, u.leadA!, 'A uno', u.sponsor!);
    projectA2 = await project(practiceA, u.pmA2!, u.leadA!, 'A dos');
    projectB = await project(practiceB, u.pmB!, u.pmB!, 'B uno');
    await owner!.query("INSERT INTO phs.project_member(project_id, user_id, role) VALUES($1, $2, 'viewer')", [projectA, u.member]);
    await owner!.query(
      `INSERT INTO phs.risk(project_id, title, risk_type, category, probability, impact, owner_id, mitigation_due_on)
       VALUES($1, 'Riesgo', 'project', 'scope', 2, 2, $2, '2026-06-01')`, [projectB, u.riskOwner]);
  });

  const ids = async (name: string) => (await service.list(u[name]!)).map((p) => p.id).filter((id) => [projectA, projectA2, projectB].includes(id));

  it('a PM sees only the projects assigned to them, not those of another PM in the same practice', async () => {
    const listed = await service.list(u.pmA!);
    expect(() => projectSummary.strict().array().min(1).parse(listed)).not.toThrow();
    expect(await ids('pmA')).toEqual([projectA]);
    expect(await ids('pmB')).toEqual([projectB]);
    expect(await service.get(u.pmA!, projectA2)).toBeNull();
    expect(await service.get(u.pmA!, projectB)).toBeNull();
    expect((await service.get(u.pmA!, projectA))?.capabilities)
      .toEqual({ view: true, editOperation: true, proposeAndReview: true, decide: false, seeFinancials: true });
  });

  it('lead and direction see their whole practice and nothing of another practice', async () => {
    expect((await ids('leadA')).sort()).toEqual([projectA, projectA2].sort());
    expect((await ids('directorA')).sort()).toEqual([projectA, projectA2].sort());
    expect((await service.get(u.leadA!, projectA2))?.capabilities.decide).toBe(true);
    expect((await service.get(u.directorA!, projectA))?.capabilities)
      .toEqual({ view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: true });
    expect(await service.get(u.leadA!, projectB)).toBeNull();
  });

  it('team members, sponsors and element owners consult their project without financials', async () => {
    const readOnly = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: false };
    expect(await ids('member')).toEqual([projectA]);
    expect(await ids('sponsor')).toEqual([projectA]);
    expect(await ids('riskOwner')).toEqual([projectB]);
    expect((await service.get(u.member!, projectA))?.capabilities).toEqual(readOnly);
    expect((await service.get(u.riskOwner!, projectB))?.capabilities).toEqual(readOnly);
  });

  it('administrators and disabled users see no business data', async () => {
    expect(await service.list(u.admin!)).toEqual([]);
    expect(await service.get(u.admin!, projectA)).toBeNull();
    expect(await service.list(u.disabled!)).toEqual([]);
    expect(await service.list(randomUUID())).toEqual([]);
  });

  it('only an administrator maintains the service type catalog', async () => {
    const catalog = new CatalogService(pool!);
    const code = `t_${randomUUID().slice(0, 8)}`;
    expect(await catalog.create(u.leadA!, randomUUID(), { code, name: code })).toBe('forbidden');
    expect(await catalog.create(u.admin!, randomUUID(), { code, name: code })).toEqual({ code, name: code, active: true });
    expect(await catalog.create(u.admin!, randomUUID(), { code, name: 'otro' })).toBe('taken');
    expect(await catalog.setActive(u.pmA!, randomUUID(), code, false)).toBe('forbidden');
    expect(await catalog.setActive(u.admin!, randomUUID(), code, false)).toEqual({ code, name: code, active: false });
    expect(await catalog.setActive(u.admin!, randomUUID(), 'missing_code', false)).toBe('not_found');
    const types = await catalog.list();
    expect(() => serviceType.strict().array().parse(types)).not.toThrow();
    expect((await catalog.list()).find((t) => t.code === code)?.active).toBe(false);
  });
});
