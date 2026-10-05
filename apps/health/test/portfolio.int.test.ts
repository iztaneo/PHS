import { randomUUID } from 'node:crypto';
import { portfolioView } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssessmentsService } from '../src/assessments.service.js';
import { PortfolioService } from '../src/portfolio.service.js';
import type { ListedProject, ProjectsClient } from '../src/projects.client.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.HEALTH_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const DIRECTOR: ProjectCapabilities = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: true };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('portfolio (PHS-037, D10)', () => {
  let scope: ListedProject[] = [];
  const projects = { list: async () => ({ projects: scope, truncated: false }) } as unknown as ProjectsClient;
  const service = new PortfolioService(pool!, projects, new AssessmentsService(pool!, projects));
  let pm = ''; let leadA = ''; let leadB = ''; let practice = ''; let clientA = ''; let clientB = '';
  // A project with baseline and budget, some progress, and a cost that makes it deviate or not.
  const project = async (name: string, status: string, client: string, lead: string, cost: string | null, currency = 'MXN') => {
    const p = await id(
      `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on, status, currency)
       VALUES($1, $2, $3, $4, 'development', $5, $6, $6, '2026-01-01', '2027-12-31', $7, $8) RETURNING id`,
      [practice, client, `P-${randomUUID().slice(0, 8)}`, name, pm, lead, status, currency]);
    const m = await id(
      `INSERT INTO phs.milestone(project_id, title, owner_id, due_on, committed_due_on, status, progress_pct) VALUES($1, 'Mitad', $2, '2027-06-30', '2027-06-30', 'in_progress', 50) RETURNING id`, [p, pm]);
    const b = await id(
      `INSERT INTO phs.baseline(project_id, version, starts_on, ends_on, scope, budget, currency, milestone_snapshot, team_snapshot, reason, created_by)
       VALUES($1, 1, '2026-01-01', '2027-12-31', 'Alcance', 1000000, $2, $3, '[]', 'Inicial', $4) RETURNING id`,
      [p, currency, JSON.stringify([{ id: m, weight: 1 }]), pm]);
    await owner!.query('UPDATE phs.project SET current_baseline_id = $2 WHERE id = $1', [p, b]);
    if (cost) await owner!.query(`INSERT INTO phs.financial_observation(project_id, effective_on, total_cost, source, recorded_by) VALUES($1, CURRENT_DATE - 1, $2, 'Prueba', $3)`, [p, cost, pm]);
    return p;
  };
  const listed = (projectId: string, name: string, status: string, client: string, clientName: string, capabilities = DIRECTOR): ListedProject => ({
    id: projectId, code: 'P', name, status, practiceId: practice, practiceName: 'Práctica', clientId: client, clientName,
    serviceTypeCode: 'development', serviceTypeName: 'Desarrollo', pmName: 'pm', capabilities,
  });

  beforeAll(async () => {
    [pm, leadA, leadB] = (await Promise.all(['pm', 'Líder A', 'Líder B'].map((n) =>
      id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [n, `u-${randomUUID()}@example.invalid`])))) as [string, string, string];
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`P${randomUUID().slice(0, 8)}`, 'Práctica']);
    clientA = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Acme']);
    clientB = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Borealis']);
  });

  it('indicators and table come from the same authorized, filtered projects', async () => {
    // Half done with 60% of the budget spent: ten points of the budget over what the progress justifies. And one exactly on budget.
    const over = await project('Sobrecosto', 'active', clientA, leadA, '600000');
    const fine = await project('En presupuesto', 'renewing', clientB, leadB, '500000');
    const dollars = await project('En dólares', 'active', clientB, leadB, '550000', 'USD');
    const paused = await project('Pausado', 'paused', clientA, leadA, '900000');
    scope = [listed(over, 'Sobrecosto', 'active', clientA, 'Acme'), listed(fine, 'En presupuesto', 'renewing', clientB, 'Borealis'),
      listed(dollars, 'En dólares', 'active', clientB, 'Borealis'), listed(paused, 'Pausado', 'paused', clientA, 'Acme')];

    const all = await service.view('x', {});
    expect(() => portfolioView.strict().parse(all)).not.toThrow();
    expect(all.incomplete).toBe(false);
    expect(all.indicators).toMatchObject({ projects: 3, excluded: 1, assessed: 3, withoutAssessment: 0, exposureHidden: 0 });
    // Simple average of the three that count; the paused one is listed last and stays out.
    const scores = all.projects.filter((p) => p.counted).map((p) => Number(p.score));
    expect(Number(all.indicators.average)).toBeCloseTo(scores.reduce((a, b) => a + b, 0) / 3, 1);
    expect(all.projects.at(-1)).toMatchObject({ name: 'Pausado', counted: false });
    // One total per currency; the paused project's overrun is not in it.
    expect(all.indicators.exposure).toEqual([{ currency: 'MXN', amount: '100000.00', projects: 1 }, { currency: 'USD', amount: '50000.00', projects: 1 }]);
    expect(all.projects.find((p) => p.id === over)).toMatchObject({ financialDeviation: '10.00', budget: '1000000.00', exposure: '100000.00', leadName: 'Líder A', freshness: 'never', trend: null });
    expect(all.projects.find((p) => p.id === fine)).toMatchObject({ financialDeviation: '0.00', exposure: '0.00' });
    expect(all.options).toEqual({
      clients: [{ id: clientA, name: 'Acme' }, { id: clientB, name: 'Borealis' }], serviceTypes: [{ code: 'development', name: 'Desarrollo' }],
      leads: [{ id: leadA, name: 'Líder A' }, { id: leadB, name: 'Líder B' }],
    });

    // Filtering changes table and indicators together; the options still offer everything.
    const b = await service.view('x', { clientId: clientB });
    expect(b.projects.map((p) => p.name).sort()).toEqual(['En dólares', 'En presupuesto']);
    expect(b.indicators).toMatchObject({ projects: 2, excluded: 0, exposure: [{ currency: 'USD', amount: '50000.00', projects: 1 }] });
    expect(b.options.clients).toHaveLength(2);
    expect((await service.view('x', { leadId: leadA, status: 'paused' })).indicators).toMatchObject({ projects: 0, excluded: 1, average: null });
    const risky = await service.view('x', { band: 'risk' });
    expect(risky.projects.every((p) => p.band === 'risk')).toBe(true);
    expect(risky.indicators.distribution).toMatchObject({ healthy: 0, attention: 0, risk: risky.indicators.projects });

    // Someone who may not see the economy gets the health but no amounts, and is told how many are hidden.
    scope = scope.map((p) => ({ ...p, capabilities: { ...DIRECTOR, seeFinancials: false } }));
    const blind = await service.view('x', {});
    expect(blind.indicators).toMatchObject({ projects: 3, exposure: [], exposureHidden: 3 });
    expect(blind.projects[0]).toMatchObject({ budget: null, financialDeviation: null, exposure: null, financialsVisible: false });
    expect(blind.projects[0]?.score).not.toBeNull();
  });
});
