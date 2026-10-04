import { randomUUID } from 'node:crypto';
import { assessment as assessmentSchema } from '@phs/contracts';
import { assess } from '@phs/health-engine';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssessmentsService } from '../src/assessments.service.js';
import type { ProjectsClient } from '../src/projects.client.js';

// Fixtures are written by the schema owner; the service under test uses the restricted Health role.
// The Projects service is replaced by a stub that answers who may see the project.
loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.HEALTH_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;

const one = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0];
const id = async (sql: string, params: unknown[]) => (await one(sql, params)).id as string;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const all: ProjectCapabilities = { view: true, editOperation: true, proposeAndReview: true, decide: true, seeFinancials: true };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('health assessments (PHS-025, PHS-026)', () => {
  let user = ''; let practice = ''; let client = '';
  let capabilities: ProjectCapabilities | null = all;
  const projects = { access: async (_identity: string, projectId: string) => (capabilities ? { id: projectId, capabilities } : null) } as ProjectsClient;
  const service = new AssessmentsService(pool!, projects);
  const current = (projectId: string) => service.current(user, 'signed', projectId);

  const project = () => id(
    `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on, client_contact, escalation_notes)
     VALUES($1, $2, $3, 'Evaluado', 'development', $4, $4, $4, '2026-01-01', '2026-12-31', 'Ana', 'Escalar') RETURNING id`,
    [practice, client, `H-${randomUUID().slice(0, 8)}`, user]);
  const milestone = (projectId: string, dueOn: string, status: string, critical = false) => id(
    `INSERT INTO phs.milestone(project_id, title, owner_id, due_on, committed_due_on, status, critical, completed_on)
     VALUES($1, 'Hito', $2, $3, $3, $4, $5, CASE WHEN $4 = 'completed' THEN $3::date END) RETURNING id`, [projectId, user, dueOn, status, critical]);
  const baseline = async (projectId: string, budget: string | null) => {
    const b = await id(
      `INSERT INTO phs.baseline(project_id, version, starts_on, ends_on, scope, budget, currency, milestone_snapshot, team_snapshot, reason, created_by)
       SELECT $1, 1, '2026-01-01', '2026-12-31', 'Alcance', $2, 'MXN',
              coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'weight', 1)) FROM phs.milestone m WHERE m.project_id = $1), '[]'), '[]', 'Inicial', $3
       RETURNING id`, [projectId, budget, user]);
    await owner!.query('UPDATE phs.project SET current_baseline_id = $2 WHERE id = $1', [projectId, b]);
  };
  const cost = (projectId: string, total: string) => owner!.query(
    `INSERT INTO phs.financial_observation(project_id, effective_on, total_cost, source, recorded_by) VALUES($1, $2, $3, 'Prueba', $4)`,
    [projectId, day(-1), total, user]);

  beforeAll(async () => {
    user = await id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', ['Salud', `salud-${randomUUID()}@example.invalid`]);
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`H${randomUUID().slice(0, 8)}`, 'Práctica']);
    client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
  });

  it('calculates, stores and explains the assessment of a project in trouble', async () => {
    const p = await project();
    await milestone(p, day(-40), 'completed');
    await milestone(p, day(-10), 'pending', true);
    await milestone(p, day(30), 'pending');
    await milestone(p, day(60), 'pending');
    await baseline(p, '100000');
    await cost(p, '60000');
    await owner!.query(
      `INSERT INTO phs.risk(project_id, title, risk_type, category, probability, impact, owner_id, mitigation_due_on, status)
       VALUES($1, 'Riesgo', 'project', 'supplier', 3, 3, $2, $3, 'materialized')`, [p, user, day(-5)]);
    const result = (await current(p))!;
    expect(() => assessmentSchema.strict().parse(result)).not.toThrow();
    // Committed 50 %, actual 25 %: deviation 25. Cost 60,000 against 25,000 justified: 35 %.
    expect(result.metrics).toMatchObject({ committedProgress: '50.00', actualProgress: '25.00', projectDeviation: '25.00', financialDeviation: '35.00' });
    expect(result.gates.filter((g) => g.active).map((g) => g.key)).toEqual(['project_deviation', 'financial_deviation', 'critical_milestone_overdue', 'critical_risk']);
    expect(result).toMatchObject({ stored: true, publication: 'provisional', gateCap: '50.00', band: 'risk', ruleSetVersion: 'phf-v1', financialsHidden: false });
    expect(Number(result.score)).toBeLessThanOrEqual(50);
    expect(result.dimensions.find((d) => d.key === 'governance')?.score).toBeNull();
    expect(result.dimensions.find((d) => d.key === 'performance')?.deductions.map((d) => d.code)).toEqual(['milestone_overdue', 'critical_milestone_overdue', 'project_deviation']);

    const stored = await one('SELECT score, weighted_score, gate_cap, project_revision, input_snapshot, publication FROM phs.health_assessment WHERE project_id = $1', [p]);
    expect(stored).toMatchObject({ score: result.score, gate_cap: '50.00', publication: 'provisional' });
    // Reproducible: the stored inputs give the stored result again.
    expect(assess(stored.input_snapshot).score).toBe(stored.score);
  });

  it('asks twice, stores once; a change in the project produces a new assessment and keeps the old one', async () => {
    const p = await project();
    await milestone(p, day(30), 'pending');
    await baseline(p, null);
    const first = (await current(p))!;
    const again = (await current(p))!;
    expect(again.calculatedAt).toBe(first.calculatedAt);
    const racing = await Promise.all([current(p), current(p), current(p)]);
    expect(new Set(racing.map((r) => r!.calculatedAt)).size).toBe(1);
    expect((await one('SELECT count(*)::int AS n FROM phs.health_assessment WHERE project_id = $1', [p])).n).toBe(1);
    // Performance 100, client 82 (no climate yet), team 75 (no members): (2500 + 984 + 750) / 47 = 90.09.
    expect(first).toMatchObject({ score: '90.09', band: 'healthy', projectRevision: 1 });

    await owner!.query("UPDATE phs.milestone SET due_on = $2, committed_due_on = $2, critical = true WHERE project_id = $1", [p, day(-3)]);
    await owner!.query('UPDATE phs.project SET revision = revision + 1 WHERE id = $1', [p]);
    const after = (await current(p))!;
    expect(after).toMatchObject({ projectRevision: 2, gateCap: '50.00', band: 'risk' });
    const history = await owner!.query('SELECT project_revision, score FROM phs.health_assessment WHERE project_id = $1 ORDER BY project_revision', [p]);
    expect(history.rows.map((r) => [Number(r.project_revision), r.score])).toEqual([[1, '90.09'], [2, after.score]]);
    await expect(owner!.query('UPDATE phs.health_assessment SET score = 99 WHERE project_id = $1', [p])).rejects.toMatchObject({ code: '55000' });
  });

  it('a project without baseline is calculated but not stored, and never shown as healthy for lack of data', async () => {
    const p = await project();
    const result = (await current(p))!;
    expect(result).toMatchObject({ stored: false, publication: 'provisional' });
    // Only client (contact) and team (technical owner) have data.
    expect(result.dimensions.filter((d) => d.score !== null).map((d) => d.key)).toEqual(['client', 'team']);
    expect(result.confidence.level).toBe('low');
    expect((await one('SELECT count(*)::int AS n FROM phs.health_assessment WHERE project_id = $1', [p])).n).toBe(0);
  });

  it('hides financial figures from users who may not see them, and everything from users without access', async () => {
    const p = await project();
    await milestone(p, day(-20), 'completed');
    await milestone(p, day(40), 'pending');
    await baseline(p, '100000');
    await cost(p, '70000');
    capabilities = { ...all, seeFinancials: false };
    const hidden = (await current(p))!;
    expect(hidden.financialsHidden).toBe(true);
    expect(hidden.metrics).toMatchObject({ financialDeviation: null, effortDeviation: null, actualProgress: '50.00' });
    expect(hidden.dimensions.find((d) => d.key === 'financial')).toMatchObject({ deductions: [] });
    expect(hidden.score).not.toBeNull();
    capabilities = all;
    expect((await current(p))!.metrics.financialDeviation).toBe('20.00');
    capabilities = null;
    expect(await current(p)).toBeNull();
    capabilities = all;
    expect(await current(randomUUID())).toBeNull();
  });
});
