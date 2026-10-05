import { randomUUID } from 'node:crypto';
import { reviewCycle, reviewSchedule } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssessmentsService } from '../src/assessments.service.js';
import { addDays, firstDueOnOrAfter, skipHolidays } from '../src/cadence.js';
import { GovernanceService } from '../src/governance.service.js';
import { HolidayService } from '../src/holiday.service.js';
import type { ProjectsClient } from '../src/projects.client.js';
import { ReviewService, type ReviewInput } from '../src/review.service.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.HEALTH_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
// Due dates land on working days; no holiday of these tests is near today.
const work = (date: string, holidays: string[] = []) => skipHolidays(date, new Set(holidays));
const NONE: ProjectCapabilities = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: false };
const PM: ProjectCapabilities = { ...NONE, editOperation: true, proposeAndReview: true, seeFinancials: true };
const LEAD: ProjectCapabilities = { ...NONE, editOperation: true, decide: true, seeFinancials: true };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('review cycle and Health Review (PHS-020 to PHS-024; D02, D03)', () => {
  const roles: Record<string, ProjectCapabilities | null> = { pm: PM, lead: LEAD, viewer: NONE, none: null };
  // Stands in for the Projects service: answers who may do what and records the figures it is sent.
  const financeCalls: { projectId: string; key: string }[] = [];
  const projects = {
    access: async (identity: string, projectId: string) => (roles[identity] ? { id: projectId, capabilities: roles[identity]! } : null),
    recordFinance: async (identity: string, projectId: string, input: { effectiveOn: string; totalCost: string; totalEffortHours: string | null }, key: string) => {
      if (identity !== 'pm') return 'forbidden';
      financeCalls.push({ projectId, key });
      await owner!.query(
        `INSERT INTO phs.financial_observation(project_id, effective_on, total_cost, total_effort_hours, source, recorded_by) VALUES($1, $2, $3, $4, 'Health Review', $5)`,
        [projectId, input.effectiveOn, input.totalCost, input.totalEffortHours, pm]);
      return 'recorded';
    },
  } as unknown as ProjectsClient;
  const assessments = new AssessmentsService(pool!, projects);
  const governance = new GovernanceService(pool!, projects, assessments);
  const reviews = new ReviewService(pool!, projects, governance, assessments);
  let pm = ''; let lead = ''; let practice = ''; let client = ''; let today = '';
  const as = (userId: string, identity: string) => ({ userId, requestId: randomUUID(), identity });
  const project = () => id(
    `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on, status)
     VALUES($1, $2, $3, 'Revisado', 'development', $4, $5, $5, '2026-01-01', '2027-12-31', 'active') RETURNING id`,
    [practice, client, `R-${randomUUID().slice(0, 8)}`, pm, lead]);
  const baseline = async (projectId: string) => {
    const b = await id(
      `INSERT INTO phs.baseline(project_id, version, starts_on, ends_on, scope, budget, currency, milestone_snapshot, team_snapshot, reason, created_by)
       VALUES($1, 1, '2026-01-01', '2027-12-31', 'Alcance', 100000, 'MXN', '[]', '[]', 'Inicial', $2) RETURNING id`, [projectId, pm]);
    await owner!.query('UPDATE phs.project SET current_baseline_id = $2 WHERE id = $1', [projectId, b]);
  };
  const policy = (nextDueOn: string, extra: Partial<Parameters<ReviewService['savePolicy']>[2]> = {}) => ({
    cadence: 'weekly' as const, nextDueOn, forecastCycles: 2, evidenceRequired: true, leadValidationRequired: true, autoTasks: true, expectedRevision: 0, ...extra,
  });
  const changes = (revision: number, extra: Partial<ReviewInput> = {}): ReviewInput => ({
    nothingChanged: false, topics: ['milestones'], notes: { milestones: 'Se cerró el diseño.' }, clientClimate: null, supportText: 'Minuta del comité.',
    activeSeconds: 240, expectedProjectRevision: revision, declaredConfidence: null, finance: null, ...extra,
  });
  const nothing = (revision: number): ReviewInput => ({
    nothingChanged: true, topics: [], notes: {}, clientClimate: null, supportText: '', activeSeconds: 30, expectedProjectRevision: revision,
    declaredConfidence: null, finance: null,
  });

  beforeAll(async () => {
    [pm, lead] = (await Promise.all(['pm', 'lead'].map((n) =>
      id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [n, `${n}-${randomUUID()}@example.invalid`])))) as [string, string];
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`R${randomUUID().slice(0, 8)}`, 'Práctica']);
    client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
    today = (await owner!.query("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS d")).rows[0].d;
  });

  it('a project without a policy has no cycle; saving the policy schedules it', async () => {
    const p = await project();
    const empty = await reviews.schedule(as(pm, 'pm'), p);
    expect(() => reviewSchedule.strict().parse(empty)).not.toThrow();
    expect(empty).toMatchObject({ policy: null, canConfigure: true, cycles: [] });
    expect((await reviews.schedule(as(pm, 'viewer'), p)).canConfigure).toBe(false);
    await expect(reviews.schedule(as(pm, 'none'), p)).rejects.toMatchObject({ code: 'not_found' });

    await expect(reviews.savePolicy(as(pm, 'viewer'), p, policy(addDays(today, 3)))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(reviews.savePolicy(as(pm, 'pm'), p, policy(addDays(today, -1)))).rejects.toMatchObject({ code: 'due_date_in_past' });
    const saved = await reviews.savePolicy(as(pm, 'pm'), p, policy(addDays(today, 3)));
    expect(() => reviewSchedule.strict().parse(saved)).not.toThrow();
    expect(saved.policy).toMatchObject({ cadence: 'weekly', nextDueOn: addDays(today, 3), revision: 1 });
    expect(saved.cycles).toHaveLength(1);
    expect(saved.cycles[0]).toMatchObject({ startsOn: today, dueOn: work(addDays(today, 3)), status: 'open', canSubmit: true, canValidate: false, reviews: [], draft: null });

    // Someone else's stale form does not overwrite; the cycle still waiting is moved, not duplicated.
    await expect(reviews.savePolicy(as(lead, 'lead'), p, policy(addDays(today, 5)))).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: 1 });
    const moved = await reviews.savePolicy(as(lead, 'lead'), p, policy(addDays(today, 5), { cadence: 'monthly', expectedRevision: 1 }));
    expect(moved.policy).toMatchObject({ cadence: 'monthly', revision: 2 });
    expect(moved.cycles).toHaveLength(1);
    expect(moved.cycles[0]).toMatchObject({ dueOn: work(addDays(today, 5)), policy: { cadence: 'monthly' } });

    await owner!.query("UPDATE phs.project SET status = 'paused' WHERE id = $1", [p]);
    await expect(reviews.savePolicy(as(pm, 'pm'), p, policy(addDays(today, 6), { expectedRevision: 2 }))).rejects.toMatchObject({ code: 'project_not_active' });
    expect((await reviews.schedule(as(pm, 'pm'), p)).cycles[0]?.canSubmit).toBe(false);
  });

  it('lists what is expected and keeps one draft per user and cycle', async () => {
    const p = await project();
    const overdue = await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical) VALUES($1, 'Entrega crítica', $2, $3, true) RETURNING id", [p, pm, addDays(today, -3)]);
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on) VALUES($1, 'Dentro del ciclo', $2, $3) RETURNING id", [p, pm, addDays(today, 2)]);
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on) VALUES($1, 'Fuera del ciclo', $2, $3) RETURNING id", [p, pm, addDays(today, 30)]);
    const { cycles: [cycle] } = await reviews.savePolicy(as(pm, 'pm'), p, policy(addDays(today, 4)));
    const titles = cycle!.expectations.map((e) => `${e.kind}:${e.title}`);
    expect(titles).toContain('alert:Hito vencido: Entrega crítica');
    expect(titles).toContain('milestone:Entrega crítica');
    expect(titles).toContain('milestone:Dentro del ciclo');
    expect(titles).toContain('task:Atender el hito vencido: Entrega crítica');
    expect(titles).not.toContain('milestone:Fuera del ciclo');
    expect(cycle!.expectations.find((e) => e.kind === 'alert')).toMatchObject({ blocking: true, critical: true });
    expect(cycle!.expectations.find((e) => e.id === overdue)).toMatchObject({ overdue: true, critical: true, blocking: false });

    const payload = { nothingChanged: false, topics: ['risks' as const], notes: { risks: 'A medias' }, clientClimate: null, supportText: '', activeSeconds: 12, declaredConfidence: null, finance: null };
    await expect(reviews.saveDraft(as(lead, 'lead'), cycle!.id, { expectedRevision: 0, payload })).rejects.toMatchObject({ code: 'forbidden' });
    const first = await reviews.saveDraft(as(pm, 'pm'), cycle!.id, { expectedRevision: 0, payload });
    expect(() => reviewCycle.strict().parse(first)).not.toThrow();
    expect(first.draft).toMatchObject({ revision: 1, payload });
    // A second tab that never saw the draft, or saw an older one, does not overwrite it.
    await expect(reviews.saveDraft(as(pm, 'pm'), cycle!.id, { expectedRevision: 0, payload })).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: 1 });
    const second = await reviews.saveDraft(as(pm, 'pm'), cycle!.id, { expectedRevision: 1, payload: { ...payload, activeSeconds: 40 } });
    expect(second.draft).toMatchObject({ revision: 2, payload: { activeSeconds: 40 } });
    // It is recovered later, and only by its author.
    expect((await reviews.cycle(as(pm, 'pm'), cycle!.id)).draft?.revision).toBe(2);
    expect((await reviews.cycle(as(lead, 'lead'), cycle!.id)).draft).toBeNull();

    // "Nothing changed" is refused while a critical alert has no cause and plan; the draft stays.
    const revision = second.projectRevision;
    await expect(reviews.submit(as(pm, 'pm'), cycle!.id, nothing(revision), randomUUID())).rejects.toMatchObject({ code: 'nothing_changed_blocked' });
    expect((await reviews.cycle(as(pm, 'pm'), cycle!.id)).draft?.revision).toBe(2);
    const alert = (await governance.events(as(pm, 'pm'), p)).find((e) => e.ruleKey === 'milestone_overdue')!;
    await governance.respond(as(pm, 'pm'), alert.id, { cause: 'Proveedor', kind: 'remediation', plan: 'Simulador', changeId: null });
    const sent = await reviews.submit(as(pm, 'pm'), cycle!.id, nothing(revision), randomUUID());
    expect(sent).toMatchObject({ status: 'submitted', draft: null, canSubmit: false });
    // What was expected at that moment is kept with the submission.
    expect(sent.reviews[0]?.expectations.some((e) => e.title === 'Entrega crítica')).toBe(true);
  });

  it('submits once, takes effect at once, schedules the next cycle and goes through the lead', async () => {
    const p = await project();
    await baseline(p);
    const { cycles: [cycle] } = await reviews.savePolicy(as(pm, 'pm'), p, policy(addDays(today, 2)));
    const revision = cycle!.projectRevision;
    const key = randomUUID();
    await expect(reviews.submit(as(lead, 'lead'), cycle!.id, changes(revision), randomUUID())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(reviews.submit(as(pm, 'pm'), cycle!.id, changes(revision, { topics: [] }), randomUUID())).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(reviews.submit(as(pm, 'pm'), cycle!.id, changes(revision, { topics: ['client'], notes: { client: 'Tenso' } }), randomUUID())).rejects.toMatchObject({ code: 'climate_required' });
    await expect(reviews.submit(as(pm, 'pm'), cycle!.id, changes(revision, { supportText: '  ' }), randomUUID())).rejects.toMatchObject({ code: 'support_required' });
    await expect(reviews.submit(as(pm, 'pm'), cycle!.id, changes(revision + 1), randomUUID())).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: revision });

    const input = changes(revision, {
      topics: ['schedule', 'client', 'finance'], notes: { client: 'Molestia por el retraso.' }, clientClimate: 'tense', declaredConfidence: 'low',
      finance: { totalCost: '42000.50', totalEffortHours: '310' },
    });
    const sent = await reviews.submit(as(pm, 'pm'), cycle!.id, input, key);
    expect(() => reviewCycle.strict().parse(sent)).not.toThrow();
    expect(sent).toMatchObject({ status: 'submitted', canSubmit: false, lastClimate: 'tense' });
    expect(sent.reviews).toHaveLength(1);
    expect(sent.reviews[0]).toMatchObject({
      revisionNo: 1, author: { id: pm }, effectiveOn: today, late: false, nothingChanged: false, topics: ['schedule', 'client', 'finance'], clientClimate: 'tense',
      supportText: 'Minuta del comité.', durationSeconds: 240, notes: { client: 'Molestia por el retraso.' }, validation: null,
      declaredConfidence: 'low', finance: { totalCost: '42000.50', totalEffortHours: '310' },
    });
    // The figures of the review became the project's cost, and the official assessment already uses them.
    expect(financeCalls.filter((c) => c.projectId === p)).toEqual([{ projectId: p, key: `review-finance:${key}` }]);
    expect((await owner!.query(`SELECT input_snapshot->>'cost' AS cost FROM phs.health_assessment WHERE review_id = $1`, [sent.reviews[0]!.id])).rows[0].cost).toBe('42000.50');
    // D02: official from the moment it is submitted, calculated with the climate it reports.
    const stored = await owner!.query(
      `SELECT assessment_kind, publication, input_snapshot->'client'->>'climate' AS climate FROM phs.health_assessment WHERE review_id = $1`, [sent.reviews[0]!.id]);
    expect(stored.rows).toEqual([{ assessment_kind: 'cycle', publication: 'official', climate: 'tense' }]);
    expect(sent.reviews[0]!.assessment?.score).not.toBeNull();

    // Retrying returns the same review; another key cannot submit the cycle again.
    const again = await reviews.submit(as(pm, 'pm'), cycle!.id, input, key);
    expect(again.reviews[0]?.id).toBe(sent.reviews[0]!.id);
    await expect(reviews.submit(as(pm, 'pm'), cycle!.id, { ...input, supportText: 'Otro' }, key)).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(reviews.submit(as(pm, 'pm'), cycle!.id, input, randomUUID())).rejects.toMatchObject({ code: 'review_already_submitted' });
    expect((await owner!.query('SELECT count(*)::int AS n FROM phs.health_review WHERE cycle_id = $1', [cycle!.id])).rows[0].n).toBe(1);
    expect(financeCalls.filter((c) => c.projectId === p)).toHaveLength(1);

    // The next cycle keeps the weekday of the first one.
    const schedule = await reviews.schedule(as(pm, 'pm'), p);
    const firstDue = work(addDays(today, 2));
    const nextStart = addDays(firstDue, 1);
    const nextCutOff = firstDueOnOrAfter(addDays(today, 2), 'weekly', nextStart);
    expect(schedule.cycles.map((c) => [c.startsOn, c.dueOn, c.status])).toEqual([
      [nextStart, work(nextCutOff), 'open'], [today, firstDue, 'submitted'],
    ]);
    expect(schedule.policy?.nextDueOn).toBe(nextCutOff);

    // The lead's inbox shows it; the PM's does not. Returning keeps the submission and opens the correction.
    expect((await reviews.pending(as(pm, 'pm'))).some((c) => c.id === cycle!.id)).toBe(false);
    const inbox = (await reviews.pending(as(lead, 'lead'))).find((c) => c.id === cycle!.id);
    expect(inbox).toMatchObject({ canValidate: true, status: 'submitted' });
    const reviewId = sent.reviews[0]!.id;
    await expect(reviews.validate(as(pm, 'pm'), reviewId, { decision: 'validated', comment: 'Yo' })).rejects.toMatchObject({ code: 'forbidden' });
    const returned = await reviews.validate(as(lead, 'lead'), reviewId, { decision: 'returned', comment: 'Falta el detalle del cliente.' });
    expect(returned).toMatchObject({ status: 'returned', canValidate: false, canSubmit: false });
    expect(returned.reviews[0]?.validation).toMatchObject({ decision: 'returned', validator: { id: lead }, comment: 'Falta el detalle del cliente.' });
    await expect(reviews.validate(as(lead, 'lead'), reviewId, { decision: 'validated', comment: 'Otra' })).rejects.toMatchObject({ code: 'already_decided' });
    const correction = (await governance.tasks(as(pm, 'pm'), p)).filter((t) => t.title.startsWith('Corregir y reenviar'));
    expect(correction).toHaveLength(1);
    expect(correction[0]).toMatchObject({ owner: { id: pm }, status: 'pending', automatic: true, dueOn: addDays(today, 3) });
    await governance.events(as(lead, 'lead'), p);
    expect((await owner!.query("SELECT count(*)::int AS n FROM phs.health_task WHERE project_id = $1 AND title LIKE 'Corregir%'", [p])).rows[0].n).toBe(1);

    // The PM sends the next version of the same cycle; the correction closes by itself and no extra cycle appears.
    const fixed = await reviews.submit(as(pm, 'pm'), cycle!.id, changes(revision, { supportText: 'Minuta y correo del cliente.' }), randomUUID());
    expect(fixed.status).toBe('submitted');
    expect(fixed.reviews.map((r) => r.revisionNo)).toEqual([2, 1]);
    // The climate reported before stands when the client is not a topic.
    expect(fixed.reviews[0]?.clientClimate).toBe('tense');
    expect((await governance.tasks(as(pm, 'pm'), p)).find((t) => t.title.startsWith('Corregir'))).toMatchObject({ status: 'completed' });
    expect((await reviews.schedule(as(pm, 'pm'), p)).cycles).toHaveLength(2);
    // The lead cannot decide on the version that was replaced.
    await expect(reviews.validate(as(lead, 'lead'), reviewId, { decision: 'validated', comment: 'Vieja' })).rejects.toMatchObject({ code: 'stale_review' });
    const validated = await reviews.validate(as(lead, 'lead'), fixed.reviews[0]!.id, { decision: 'validated', comment: 'Completa.' });
    expect(validated).toMatchObject({ status: 'validated', canValidate: false, canSubmit: false });
    expect((await reviews.pending(as(lead, 'lead'))).some((c) => c.id === cycle!.id)).toBe(false);
  });

  it('an overdue cycle raises its alert without blocking its own review, and a late review keeps the calendar', async () => {
    const p = await project();
    const { cycles: [cycle] } = await reviews.savePolicy(as(pm, 'pm'), p, policy(addDays(today, 1), { leadValidationRequired: false, evidenceRequired: false }));
    // Ten days go by without a review.
    await owner!.query('UPDATE phs.review_cycle SET starts_on = $2, due_on = $3 WHERE id = $1', [cycle!.id, addDays(today, -16), addDays(today, -10)]);
    await owner!.query('UPDATE phs.review_policy SET anchor_on = $2 WHERE project_id = $1', [p, addDays(today, -10)]);
    const late = await reviews.cycle(as(pm, 'pm'), cycle!.id);
    expect(late.status).toBe('overdue');
    const events = await governance.events(as(pm, 'pm'), p);
    expect(events.map((e) => e.ruleKey)).toEqual(['review_overdue']);
    expect(events[0]?.task).toMatchObject({ owner: { id: pm }, priority: 'high' });
    // D02: its own delay is not among the expectations, so "nothing changed" goes through.
    expect(late.expectations).toEqual([]);
    const sent = await reviews.submit(as(pm, 'pm'), cycle!.id, nothing(late.projectRevision), randomUUID());
    // Without lead validation the review is closed as soon as it is sent.
    expect(sent).toMatchObject({ status: 'closed', canValidate: false });
    expect(sent.reviews[0]).toMatchObject({ late: true, assessment: null });
    await expect(reviews.validate(as(lead, 'lead'), sent.reviews[0]!.id, { decision: 'validated', comment: 'No hace falta' })).rejects.toMatchObject({ code: 'validation_not_required' });
    expect((await governance.events(as(pm, 'pm'), p))[0]).toMatchObject({ ruleKey: 'review_overdue', resolvedAt: expect.any(String) });
    // Next cycle: starts tomorrow, due on the first cut-off day from then on (same weekday as the anchor).
    const next = (await reviews.schedule(as(pm, 'pm'), p)).cycles[0]!;
    expect(next).toMatchObject({ startsOn: addDays(today, 1), dueOn: work(addDays(today, 4)), status: 'open' });
  });

  it('holidays are kept by an administrator and reviews are never due on a non-working day', async () => {
    const holidays = new HolidayService(pool!);
    const admin = await id('INSERT INTO phs.app_user(display_name, email, is_admin) VALUES($1, $2, true) RETURNING id', ['admin', `admin-${randomUUID()}@example.invalid`]);
    // A week no other test uses, far enough not to touch their cycles.
    const base = addDays(today, 400 + Math.floor(Math.random() * 2000) * 7);
    const first = addDays(base, 7);
    const later = addDays(base, 14);
    try {
      expect(await holidays.add(pm, randomUUID(), { day: first, name: 'No soy administrador' })).toBe('forbidden');
      const p = await project();
      const { cycles: [cycle] } = await reviews.savePolicy(as(pm, 'pm'), p, policy(base, { leadValidationRequired: false, evidenceRequired: false }));
      // The second review would be due on `first`: declared a holiday together with the day after.
      expect(await holidays.add(admin, randomUUID(), { day: first, name: 'Festivo' })).toEqual(expect.arrayContaining([{ day: first, name: 'Festivo' }]));
      expect(await holidays.add(admin, randomUUID(), { day: first, name: 'Repetido' })).toBe('taken');
      await holidays.add(admin, randomUUID(), { day: addDays(first, 1), name: 'Puente' });
      await owner!.query('UPDATE phs.review_cycle SET starts_on = $2, due_on = $3 WHERE id = $1', [cycle!.id, addDays(today, -8), addDays(today, -1)]);
      await owner!.query('UPDATE phs.review_policy SET anchor_on = $2 WHERE project_id = $1', [p, base]);
      await reviews.submit(as(pm, 'pm'), cycle!.id, nothing(cycle!.projectRevision), randomUUID());
      // A new holiday on the date of a review that is still waiting moves it, and the policy keeps its cut-off day.
      // The cycle is placed on a far date first so this test shares no day with any other.
      const next = (await reviews.schedule(as(pm, 'pm'), p)).cycles[0]!;
      expect(next.status).toBe('open');
      await owner!.query('UPDATE phs.review_cycle SET due_on = $2 WHERE id = $1', [next.id, later]);
      expect(await holidays.add(admin, randomUUID(), { day: later, name: 'Nuevo festivo' })).toEqual(expect.arrayContaining([{ day: later, name: 'Nuevo festivo' }]));
      const moved = await reviews.schedule(as(pm, 'pm'), p);
      expect(moved.cycles[0]?.dueOn).toBe(work(later, [first, addDays(first, 1), later]));
      expect(moved.policy?.nextDueOn).toBe(base);
      // Saving a policy whose date is a holiday schedules the day after the long weekend.
      const q = await project();
      const shifted = await reviews.savePolicy(as(pm, 'pm'), q, policy(first));
      expect(shifted.cycles[0]?.dueOn).toBe(work(first, [first, addDays(first, 1), later]));
      expect(shifted.policy?.nextDueOn).toBe(first);
      expect(await holidays.remove(pm, randomUUID(), first)).toBe('forbidden');
      expect(await holidays.remove(admin, randomUUID(), first)).not.toContainEqual({ day: first, name: 'Festivo' });
      expect(await holidays.remove(admin, randomUUID(), first)).toBe('not_found');
    } finally {
      await owner!.query('DELETE FROM phs.holiday WHERE day = ANY($1::date[])', [[first, addDays(first, 1), later]]);
    }
  });
});
