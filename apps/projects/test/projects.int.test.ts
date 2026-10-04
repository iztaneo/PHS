import { randomUUID } from 'node:crypto';
import { projectDetail } from '@phs/contracts';
import { createPool, loadEnv } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectsService, type CreateProject } from '../src/projects.service.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.PROJECTS_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;

const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const user = (name: string) =>
  id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [name, `${name}-${randomUUID()}@example.invalid`]);
const grant = (practiceId: string, userId: string, role: string) =>
  owner!.query('INSERT INTO phs.practice_membership(practice_id, user_id, role) VALUES($1, $2, $3)', [practiceId, userId, role]);
const count = async (sql: string, params: unknown[]) => Number((await owner!.query(sql, params)).rows[0].n);

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('project commands (PHS-008, PHS-009)', () => {
  const service = new ProjectsService(pool!);
  let practice = ''; let other = ''; let pm = ''; let pm2 = ''; let lead = ''; let director = ''; let disabled = ''; let plain = ''; let outsider = '';
  const actor = (userId: string) => ({ userId, requestId: randomUUID() });
  const input = (overrides: Partial<CreateProject> = {}): CreateProject => ({
    practiceId: practice, code: `C-${randomUUID().slice(0, 8)}`, name: 'Proyecto de prueba', description: 'Descripción',
    clientName: `Cliente ${randomUUID().slice(0, 8)}`, serviceTypeCode: 'development', pmId: pm, leadId: lead,
    technicalOwnerId: plain, sponsorId: null, clientContact: '', escalationNotes: '', startsOn: '2026-01-01',
    endsOn: '2026-12-31', currency: 'MXN', ...overrides,
  });
  const create = async (by: string, overrides: Partial<CreateProject> = {}) =>
    (await service.create(actor(by), input(overrides), randomUUID())).project;

  beforeAll(async () => {
    practice = await id('INSERT INTO phs.practice(code, name, timezone) VALUES($1, $2, $3) RETURNING id', [`T${randomUUID().slice(0, 8)}`, 'Práctica', 'America/Bogota']);
    other = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`T${randomUUID().slice(0, 8)}`, 'Otra']);
    [pm, pm2, lead, director, disabled, plain, outsider] = (await Promise.all(
      ['pm', 'pm2', 'lead', 'director', 'disabled', 'plain', 'outsider'].map(user))) as [string, string, string, string, string, string, string];
    await grant(practice, pm, 'pm'); await grant(practice, pm2, 'pm'); await grant(practice, lead, 'lead');
    await grant(practice, director, 'director'); await grant(practice, disabled, 'pm');
    await owner!.query('UPDATE phs.app_user SET active = false WHERE id = $1', [disabled]);
  });

  it('creates a project with audit and outbox in one transaction', async () => {
    const by = actor(pm);
    const data = input();
    const { project } = await service.create(by, data, randomUUID());
    expect(() => projectDetail.strict().parse(project)).not.toThrow();
    expect(project).toMatchObject({
      code: data.code, name: data.name, status: 'planned', clientName: data.clientName, startsOn: '2026-01-01',
      endsOn: '2026-12-31', currency: 'MXN', timezone: 'America/Bogota', revision: 1, hasBaseline: false,
      pm: { id: pm }, lead: { id: lead }, sponsor: null,
    });
    expect(project.capabilities).toMatchObject({ editOperation: true, decide: false });
    expect((await service.get(pm, project.id))?.name).toBe(data.name);
    const audit = await owner!.query('SELECT action, actor_id, project_id FROM phs.audit_entry WHERE request_id = $1', [by.requestId]);
    expect(audit.rows).toEqual([{ action: 'project.created', actor_id: pm, project_id: project.id }]);
    expect(await count('SELECT count(*) AS n FROM phs.outbox_message WHERE deduplication_key = $1', [`project.created:${project.id}`])).toBe(1);
  });

  it('rejects each invalid creation with a specific error and leaves nothing behind', async () => {
    const existing = await create(pm);
    const cases: [string, string, Partial<CreateProject>][] = [
      [pm, 'code_taken', { code: existing.code }],
      [pm, 'invalid_dates', { startsOn: '2026-06-01', endsOn: '2026-05-31' }],
      [pm, 'responsible_not_enabled', { technicalOwnerId: disabled }],
      [pm, 'responsible_not_enabled', { sponsorId: randomUUID() }],
      [pm, 'pm_not_eligible', { pmId: plain }],
      [pm, 'pm_not_eligible', { pmId: pm2 }],
      [pm, 'lead_not_eligible', { leadId: pm }],
      [pm, 'service_type_inactive', { serviceTypeCode: 'does_not_exist' }],
      [pm, 'practice_not_authorized', { practiceId: other }],
      [director, 'practice_not_authorized', {}],
      [plain, 'practice_not_authorized', {}],
      [disabled, 'practice_not_authorized', {}],
    ];
    for (const [by, code, overrides] of cases) {
      const data = input(overrides);
      await expect(service.create(actor(by), data, randomUUID()), code).rejects.toMatchObject({ code });
      expect(await count('SELECT count(*) AS n FROM phs.client WHERE name = $1', [data.clientName]), `${code} client`).toBe(0);
      if (code !== 'code_taken') expect(await count('SELECT count(*) AS n FROM phs.project WHERE code = $1', [data.code]), code).toBe(0);
    }
    expect((await create(lead, { pmId: pm2 })).pm.id).toBe(pm2);
  });

  it('a failure after the first writes rolls back the project, its client and its audit entry', async () => {
    const by = actor(pm);
    // A blank name passes this layer but violates the database constraint at the INSERT of the project,
    // after the client row was already written in the same transaction.
    const data = input({ name: '   ' });
    await expect(service.create(by, data, randomUUID())).rejects.toMatchObject({ code: '23514' });
    expect(await count('SELECT count(*) AS n FROM phs.client WHERE name = $1', [data.clientName])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM phs.audit_entry WHERE request_id = $1', [by.requestId])).toBe(0);
    expect(await count('SELECT count(*) AS n FROM phs.project WHERE code = $1', [data.code])).toBe(0);
  });

  it('a retried command returns the original result and never runs twice', async () => {
    const key = randomUUID();
    const data = input();
    const first = await service.create(actor(pm), data, key);
    const retry = await service.create(actor(pm), data, key);
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.project).toEqual(first.project);
    expect(await count('SELECT count(*) AS n FROM phs.project WHERE code = $1', [data.code])).toBe(1);
    expect(await count('SELECT count(*) AS n FROM phs.audit_entry WHERE entity_id = $1', [first.project.id])).toBe(1);
    await expect(service.create(actor(pm), { ...data, name: 'Otro contenido' }, key)).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    // The same key from another user is a different command.
    const otherUser = await service.create(actor(lead), input(), key);
    expect(otherUser.replayed).toBe(false);
    // Two simultaneous retries: exactly one project.
    const racing = input();
    const raceKey = randomUUID();
    const results = await Promise.all([service.create(actor(pm), racing, raceKey), service.create(actor(pm), racing, raceKey)]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(await count('SELECT count(*) AS n FROM phs.project WHERE code = $1', [racing.code])).toBe(1);
  });

  it('reuses an existing client regardless of case', async () => {
    const name = `Cliente ${randomUUID().slice(0, 8)}`;
    const a = await create(pm, { clientName: name });
    const b = await create(pm, { clientName: name.toUpperCase() });
    expect(b.clientId).toBe(a.clientId);
    expect((await service.clients(pm)).filter((c) => c.id === a.clientId)).toHaveLength(1);
  });

  it('edits descriptive data, increases the revision and records before and after', async () => {
    const project = await create(pm);
    const by = actor(pm);
    const updated = await service.update(by, project.id, { expectedRevision: 1, name: 'Nuevo nombre', sponsorId: plain, endsOn: '2027-01-31' });
    expect(updated).toMatchObject({ name: 'Nuevo nombre', revision: 2, endsOn: '2027-01-31', sponsor: { id: plain } });
    const audit = await owner!.query('SELECT action, before_data, after_data FROM phs.audit_entry WHERE request_id = $1', [by.requestId]);
    expect(audit.rows).toEqual([{
      action: 'project.updated',
      before_data: { name: 'Proyecto de prueba', sponsorId: null, endsOn: '2026-12-31' },
      after_data: { name: 'Nuevo nombre', sponsorId: plain, endsOn: '2027-01-31' },
    }]);
    expect(await count('SELECT count(*) AS n FROM phs.outbox_message WHERE deduplication_key = $1', [`project.updated:${project.id}:2`])).toBe(1);
    // Saving the same values changes nothing and does not consume a revision.
    expect((await service.update(actor(pm), project.id, { expectedRevision: 2, name: 'Nuevo nombre' })).revision).toBe(2);
  });

  it('two editors with the same revision produce one success and one conflict', async () => {
    const project = await create(pm);
    const results = await Promise.allSettled([
      service.update(actor(pm), project.id, { expectedRevision: 1, name: 'Edición del PM' }),
      service.update(actor(lead), project.id, { expectedRevision: 1, name: 'Edición del líder' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toMatchObject({ code: 'revision_conflict', currentRevision: 2 });
    const saved = await service.get(lead, project.id);
    expect(saved?.revision).toBe(2);
    expect(saved?.name).toBe((ok[0] as PromiseFulfilledResult<{ name: string }>).value.name);
  });

  it('applies edit permissions and business rules', async () => {
    const project = await create(pm);
    const patch = { expectedRevision: 1, name: 'Intento' };
    await expect(service.update(actor(director), project.id, patch)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.update(actor(pm2), project.id, patch)).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.update(actor(pm), randomUUID(), patch)).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.update(actor(pm), project.id, { expectedRevision: 1, pmId: pm2 })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.update(actor(pm), project.id, { expectedRevision: 1, endsOn: '2025-01-01' })).rejects.toMatchObject({ code: 'invalid_dates' });
    await expect(service.update(actor(pm), project.id, { expectedRevision: 1, technicalOwnerId: disabled })).rejects.toMatchObject({ code: 'responsible_not_enabled' });
    await expect(service.update(actor(lead), project.id, { expectedRevision: 1, pmId: plain })).rejects.toMatchObject({ code: 'pm_not_eligible' });
    expect((await service.get(pm, project.id))?.revision).toBe(1);
    const reassigned = await service.update(actor(lead), project.id, { expectedRevision: 1, pmId: pm2 });
    expect(reassigned.pm.id).toBe(pm2);
    expect(await service.get(pm, project.id)).toBeNull();
  });

  it('dates of a project with a baseline change only through the change flow', async () => {
    const project = await create(pm);
    const baseline = await id(
      `INSERT INTO phs.baseline(project_id, version, starts_on, ends_on, scope, currency, milestone_snapshot, team_snapshot, reason, created_by)
       VALUES($1, 1, '2026-01-01', '2026-12-31', 'Alcance', 'MXN', '[]', '[]', 'Inicial', $2) RETURNING id`, [project.id, pm]);
    await owner!.query('UPDATE phs.project SET current_baseline_id = $2 WHERE id = $1', [project.id, baseline]);
    expect((await service.get(pm, project.id))?.hasBaseline).toBe(true);
    await expect(service.update(actor(pm), project.id, { expectedRevision: 1, endsOn: '2027-06-30' })).rejects.toMatchObject({ code: 'baseline_change_required' });
    expect((await service.update(actor(pm), project.id, { expectedRevision: 1, description: 'Solo texto' })).revision).toBe(2);
  });

  it('searches, filters and paginates within the user scope', async () => {
    const tag = randomUUID().slice(0, 8);
    const clientName = `Filtro ${tag}`;
    await create(pm, { name: `Alfa ${tag}`, code: `AA-${tag}`, clientName });
    await create(pm, { name: `Beta ${tag}`, code: `BB-${tag}`, clientName, serviceTypeCode: 'consulting' });
    await create(lead, { name: `Gama ${tag}`, code: `CC-${tag}`, pmId: pm2 });
    const page = (who: string, query: object) => service.list(who, { page: 1, pageSize: 20, ...query });
    expect((await page(pm, { q: tag })).items.map((p) => p.name)).toEqual([`Alfa ${tag}`, `Beta ${tag}`]);
    expect((await page(lead, { q: tag })).total).toBe(3);
    expect((await page(pm, { q: `bb-${tag}` })).items.map((p) => p.code)).toEqual([`BB-${tag}`]);
    expect((await page(pm, { q: tag, serviceTypeCode: 'consulting' })).items).toHaveLength(1);
    expect((await page(pm, { q: tag, status: 'closed' })).total).toBe(0);
    const clientId = (await service.clients(pm)).find((c) => c.name === clientName)!.id;
    expect((await page(lead, { clientId })).total).toBe(2);
    expect((await page(pm, { q: '%' })).total).toBe(0);
    const first = await service.list(lead, { q: tag, page: 1, pageSize: 2 });
    const second = await service.list(lead, { q: tag, page: 2, pageSize: 2 });
    expect([first.items.length, first.total, second.items.length]).toEqual([2, 3, 1]);
    // The technical owner is named on the projects and may consult them; an unrelated user sees none.
    expect((await page(plain, { q: tag })).total).toBe(3);
    expect((await page(outsider, { q: tag })).total).toBe(0);
  });

  it('lists people of a practice only for those who can create projects there', async () => {
    const people = await service.people(pm, practice);
    expect(people.find((p) => p.id === lead)?.roles).toEqual(['lead']);
    expect(people.find((p) => p.id === plain)?.roles).toEqual([]);
    expect(people.some((p) => p.id === disabled)).toBe(false);
    await expect(service.people(director, practice)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.people(pm, other)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
