import { randomUUID } from 'node:crypto';
import { assessment as assessmentSchema, outlook as outlookSchema, schedulerStatus } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssessmentsService } from '../src/assessments.service.js';
import { addDays } from '../src/cadence.js';
import { GovernanceService } from '../src/governance.service.js';
import type { ProjectsClient } from '../src/projects.client.js';
import { ReviewService, type ReviewInput } from '../src/review.service.js';
import { SchedulerService } from '../src/scheduler.service.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.HEALTH_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const ALL: ProjectCapabilities = { view: true, editOperation: true, proposeAndReview: true, decide: true, seeFinancials: true };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('confidence, trend, forecast and the scheduled process (PHS-027 to PHS-029, PHS-033)', () => {
  const projects = { access: async (identity: string, projectId: string) => (identity === 'none' ? null : { id: projectId, capabilities: ALL }) } as ProjectsClient;
  const assessments = new AssessmentsService(pool!, projects);
  const governance = new GovernanceService(pool!, projects, assessments);
  const reviews = new ReviewService(pool!, projects, governance, assessments);
  let pm = ''; let practice = ''; let client = ''; let today = '';
  const actor = () => ({ userId: pm, requestId: randomUUID(), identity: 'pm' });
  const project = async (withBaseline = true) => {
    const p = await id(
      `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on, status)
       VALUES($1, $2, $3, 'Proyección', 'development', $4, $4, $4, '2026-01-01', '2027-12-31', 'active') RETURNING id`,
      [practice, client, `O-${randomUUID().slice(0, 8)}`, pm]);
    if (withBaseline) {
      const b = await id(
        `INSERT INTO phs.baseline(project_id, version, starts_on, ends_on, scope, budget, currency, milestone_snapshot, team_snapshot, reason, created_by)
         VALUES($1, 1, '2026-01-01', '2027-12-31', 'Alcance', 100000, 'MXN', '[]', '[]', 'Inicial', $2) RETURNING id`, [p, pm]);
      await owner!.query('UPDATE phs.project SET current_baseline_id = $2 WHERE id = $1', [p, b]);
    }
    return p;
  };
  const review = (revision: number, climate: 'good' | 'critical'): ReviewInput => ({
    nothingChanged: false, topics: ['client'], notes: {}, clientClimate: climate, supportText: 'Minuta.', activeSeconds: 60,
    expectedProjectRevision: revision, declaredConfidence: null, finance: null,
  });
  const policy = { cadence: 'weekly' as const, nextDueOn: '', forecastCycles: 2, evidenceRequired: true, leadValidationRequired: false, autoTasks: true, expectedRevision: 0 };

  beforeAll(async () => {
    pm = await id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', ['pm', `pm-${randomUUID()}@example.invalid`]);
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`O${randomUUID().slice(0, 8)}`, 'Práctica']);
    client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
    today = (await owner!.query("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS d")).rows[0].d;
  });

  it('the trend compares the official cuts of two consecutive cycles', async () => {
    const p = await project();
    const before = await assessments.outlook('pm', p);
    expect(() => outlookSchema.strict().parse(before)).not.toThrow();
    expect(before?.trend).toMatchObject({ direction: null, reason: 'insufficient_history', current: null, previous: null });
    expect(await assessments.outlook('none', p)).toBeNull();

    const first = (await reviews.savePolicy(actor(), p, { ...policy, nextDueOn: addDays(today, 3) })).cycles[0]!;
    await reviews.submit(actor(), first.id, review(first.projectRevision, 'good'), randomUUID());
    const one = await assessments.outlook('pm', p);
    expect(one?.trend).toMatchObject({ direction: null, reason: 'insufficient_history', previous: null });
    expect(one?.trend.current?.score).not.toBeNull();
    // Consulting the health several times the same day adds operational assessments, not cuts.
    await assessments.current(pm, 'pm', p);
    await assessments.current(pm, 'pm', p);
    expect((await assessments.outlook('pm', p))?.trend.reason).toBe('insufficient_history');

    // Second cycle: the client turns critical, which caps the score at 45.
    const second = (await reviews.schedule(actor(), p)).cycles[0]!;
    await reviews.submit(actor(), second.id, review(second.projectRevision, 'critical'), randomUUID());
    const two = await assessments.outlook('pm', p);
    expect(() => outlookSchema.strict().parse(two)).not.toThrow();
    expect(two?.trend).toMatchObject({ direction: 'down', reason: null, current: { score: '45.00', cycleDueOn: second.dueOn }, previous: { cycleDueOn: first.dueOn } });
    expect(two!.trend.delta).toBe((45 - Number(one!.trend.current!.score)).toFixed(2));
    // The decline itself adds pressure to the forecast.
    expect(two?.forecast.factors.find((f) => f.code === 'declining_trend')?.points).toBe((Math.abs(Number(two!.trend.delta)) * 1.2).toFixed(2));
  });

  it('the forecast names what falls due inside the configured horizon', async () => {
    const p = await project(false);
    const inside = await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical) VALUES($1, 'Entrega', $2, $3, true) RETURNING id", [p, pm, addDays(today, 10)]);
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on) VALUES($1, 'Lejano', $2, $3) RETURNING id", [p, pm, addDays(today, 40)]);
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on, status, completed_on) VALUES($1, 'Cumplido', $2, $3, 'completed', $4) RETURNING id", [p, pm, addDays(today, 5), today]);
    // Without a cycle the default horizon applies, and the answer says so: two fortnights.
    const assumed = await assessments.outlook('pm', p);
    expect(assumed?.forecast.horizon).toEqual({ cadence: 'fortnightly', cycles: 2, until: addDays(today, 28), assumed: true });
    expect(assumed?.forecast.factors.map((f) => [f.code, f.target?.id])).toEqual([['milestone_due', inside], ['critical_milestone_due', inside]]);
    expect(assumed?.forecast).toMatchObject({ pressure: '8.00', level: 'at_risk' });

    // One weekly cycle ahead leaves the milestone outside the window.
    await reviews.savePolicy(actor(), p, { ...policy, forecastCycles: 1, nextDueOn: addDays(today, 3) });
    const narrow = await assessments.outlook('pm', p);
    expect(narrow?.forecast.horizon).toEqual({ cadence: 'weekly', cycles: 1, until: addDays(today, 7), assumed: false });
    expect(narrow?.forecast).toMatchObject({ pressure: '0.00', level: 'stable', factors: [] });
  });

  it('confidence explains each deduction and counts critical alerts without cause and plan', async () => {
    const p = await project();
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical) VALUES($1, 'Vencido', $2, $3, true) RETURNING id", [p, pm, addDays(today, -3)]);
    await governance.sync(p);
    const view = await assessments.current(pm, 'pm', p);
    expect(() => assessmentSchema.strict().parse(view)).not.toThrow();
    expect(view?.stored).toBe(true);
    const codes = Object.fromEntries(view!.confidence.deductions.map((d) => [d.code, d]));
    expect(codes.expectation_unresolved).toMatchObject({ count: 1, points: '5.00' });
    expect(codes.review_stale).toMatchObject({ points: '45.00' });
    expect(100 - view!.confidence.deductions.reduce((sum, d) => sum + Number(d.points), 0)).toBe(Number(view!.confidence.value));
    // Once the PM gives cause and plan the alert stops lowering confidence.
    const [alert] = await governance.events(actor(), p);
    await governance.respond(actor(), alert!.id, { cause: 'Proveedor', kind: 'remediation', plan: 'Simulador', changeId: null });
    const after = await assessments.outlook('pm', p).then(() => assessments.inputs(pool!, p));
    expect(after?.input.governance.unresolvedExpectations).toBe(0);
  });

  it('the scheduled process detects and assesses with nobody connected, one pass at a time', async () => {
    const p = await project();
    const broken = await project();
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical) VALUES($1, 'Venció anoche', $2, $3, true) RETURNING id", [p, pm, addDays(today, -1)]);
    const count = async (table: string) => (await owner!.query(`SELECT count(*)::int AS n FROM phs.${table} WHERE project_id = $1`, [p])).rows[0].n as number;
    expect([await count('health_event'), await count('health_task'), await count('health_assessment')]).toEqual([0, 0, 0]);

    // One project fails: it is recorded and does not stop the other.
    const flaky = { sync: async (projectId: string) => { if (projectId === broken) throw new Error('fallo simulado'); await governance.sync(projectId); } } as GovernanceService;
    const scheduler = new SchedulerService(pool!, flaky, assessments, 0);
    const run = await scheduler.runOnce([p, broken]);
    expect(run).toMatchObject({ projects: 1, failures: 1, finishedAt: expect.any(String) });
    expect([await count('health_event'), await count('health_task'), await count('health_assessment')]).toEqual([1, 1, 1]);
    const status = await scheduler.status();
    expect(() => schedulerStatus.strict().parse(status)).not.toThrow();
    expect(status).toMatchObject({ intervalSeconds: 0, lastRun: { projects: 1, failures: 1 } });
    const recorded = await owner!.query('SELECT failures FROM phs.scheduler_run ORDER BY started_at DESC LIMIT 1');
    expect(recorded.rows[0].failures).toEqual([{ projectId: broken, error: 'fallo simulado' }]);

    // The next pass recovers the one that failed and repeats nothing for the other.
    const healthy = new SchedulerService(pool!, governance, assessments, 0);
    expect(await healthy.runOnce([p, broken])).toMatchObject({ projects: 2, failures: 0 });
    expect([await count('health_event'), await count('health_task'), await count('health_assessment')]).toEqual([1, 1, 1]);

    // While another instance holds the lock this one does nothing.
    const other = await owner!.connect();
    try {
      await other.query("SELECT pg_advisory_lock(hashtextextended('phs-health-scheduler', 0))");
      expect(await healthy.runOnce([p])).toBe('busy');
      await other.query("SELECT pg_advisory_unlock(hashtextextended('phs-health-scheduler', 0))");
      expect(await healthy.runOnce([p])).toMatchObject({ failures: 0 });
    } finally {
      other.release();
    }
  });

  it('runs older than three months are summarised by day and removed; recent ones stay', async () => {
    // A day of its own in the distant past, so repeating the test never adds to an earlier summary.
    const day = `${1970 + Math.floor(Math.random() * 30)}-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 10)}`;
    const bad = randomUUID();
    const old = (hour: string, finished: boolean, processed: number, failures: object[]) => owner!.query(
      `INSERT INTO phs.scheduler_run(started_at, finished_at, projects_processed, failures)
       VALUES($1::timestamptz, CASE WHEN $2 THEN $1::timestamptz + interval '2 seconds' END, $3, $4)`,
      [`${day} ${hour}:00:00+00`, finished, processed, JSON.stringify(failures)]);
    await old('08', true, 5, []);
    await old('09', true, 4, [{ projectId: bad, error: 'sin conexión' }]);
    await old('10', true, 4, [{ projectId: bad, error: 'sin conexión' }]);
    await old('11', false, 0, []);
    const recent = await id("INSERT INTO phs.scheduler_run(started_at, finished_at, projects_processed) VALUES(now() - interval '80 days', now() - interval '80 days', 7) RETURNING id", []);

    const scheduler = new SchedulerService(pool!, governance, assessments, 0);
    expect(await scheduler.runOnce([])).toMatchObject({ projects: 0, failures: 0 });
    const summary = await owner!.query(
      `SELECT runs, completed, interrupted, runs_with_failures, projects_processed::int AS projects_processed, failures FROM phs.scheduler_run_daily WHERE day = $1`, [day]);
    expect(summary.rows).toEqual([{
      runs: 4, completed: 3, interrupted: 1, runs_with_failures: 2, projects_processed: 13, failures: [{ projectId: bad, error: 'sin conexión', runs: 2 }],
    }]);
    expect((await owner!.query("SELECT count(*)::int AS n FROM phs.scheduler_run WHERE started_at < now() - interval '4 months'")).rows[0].n).toBe(0);
    expect((await owner!.query('SELECT count(*)::int AS n FROM phs.scheduler_run WHERE id = $1', [recent])).rows[0].n).toBe(1);
    // Nothing left to archive: another pass changes nothing.
    await scheduler.runOnce([]);
    expect((await owner!.query('SELECT runs FROM phs.scheduler_run_daily WHERE day = $1', [day])).rows[0].runs).toBe(4);
    expect((await scheduler.status()).lastRun).toMatchObject({ projects: 0, failures: 0 });
  });
});
