import { randomUUID } from 'node:crypto';
import { healthCenter } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssessmentsService } from '../src/assessments.service.js';
import { addDays } from '../src/cadence.js';
import { CenterService } from '../src/center.service.js';
import { GovernanceService } from '../src/governance.service.js';
import type { ListedProject, ProjectsClient } from '../src/projects.client.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.HEALTH_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const NONE: ProjectCapabilities = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: false };
const PM: ProjectCapabilities = { ...NONE, editOperation: true, proposeAndReview: true, seeFinancials: true };
const LEAD: ProjectCapabilities = { ...NONE, editOperation: true, decide: true, seeFinancials: true };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('Health Center (PHS-035, PHS-036)', () => {
  // The Projects stub lists whatever each test puts in `scope`, with the capabilities it chooses.
  let scope: ListedProject[] = [];
  let truncated = false;
  const projects = {
    list: async () => ({ projects: scope, truncated }),
    access: async (_identity: string, projectId: string) => ({ id: projectId, capabilities: PM }),
  } as unknown as ProjectsClient;
  const assessments = new AssessmentsService(pool!, projects);
  const governance = new GovernanceService(pool!, projects, assessments);
  const center = new CenterService(pool!, projects, assessments);
  let pm = ''; let dev = ''; let practice = ''; let client = ''; let today = '';
  const project = async (name: string, status = 'active') => {
    const p = await id(
      `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on, status)
       VALUES($1, $2, $3, $4, 'development', $5, $5, $5, '2026-01-01', '2027-12-31', $6) RETURNING id`,
      [practice, client, `C-${randomUUID().slice(0, 8)}`, name, pm, status]);
    return p;
  };
  const listed = (projectId: string, name: string, capabilities: ProjectCapabilities, status = 'active'): ListedProject => ({
    id: projectId, code: 'C', name, status, practiceId: practice, practiceName: 'Práctica', clientId: client, clientName: 'Cliente',
    serviceTypeCode: 'development', serviceTypeName: 'Desarrollo', pmName: 'pm', capabilities,
  });
  const cycle = (projectId: string, dueOn: string) => id(
    `INSERT INTO phs.review_cycle(project_id, starts_on, due_on, policy_snapshot) VALUES($1, $2, $3, '{"cadence":"weekly","leadValidationRequired":true}') RETURNING id`,
    [projectId, addDays(dueOn, -7), dueOn]);

  beforeAll(async () => {
    [pm, dev] = (await Promise.all(['pm', 'dev'].map((n) =>
      id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [n, `${n}-${randomUUID()}@example.invalid`])))) as [string, string];
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`C${randomUUID().slice(0, 8)}`, 'Práctica']);
    client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
    today = (await owner!.query("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS d")).rows[0].d;
  });

  it('without projects there is nothing to attend, and a partial list says so', async () => {
    scope = []; truncated = false;
    expect(await center.view(pm, 'x')).toEqual({ today, projects: [], focus: [], incomplete: false });
    truncated = true;
    expect((await center.view(pm, 'x')).incomplete).toBe(true);
    // Closed projects are not work to attend.
    truncated = false;
    scope = [listed(await project('Cerrado', 'closed'), 'Cerrado', PM, 'closed')];
    expect((await center.view(pm, 'x')).projects).toEqual([]);
  });

  it('shows the PM what to do today, most critical first', async () => {
    const p = await project('Del PM');
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical) VALUES($1, 'Vencido crítico', $2, $3, true) RETURNING id", [p, dev, addDays(today, -2)]);
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on) VALUES($1, 'Entrega próxima', $2, $3) RETURNING id", [p, dev, addDays(today, 3)]);
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on) VALUES($1, 'Entrega lejana', $2, $3) RETURNING id", [p, dev, addDays(today, 30)]);
    await id(`INSERT INTO phs.risk(project_id, title, description, risk_type, category, probability, impact, owner_id, mitigation_due_on, strategy)
              VALUES($1, 'Proveedor', 'd', 'project', 'supplier', 3, 3, $2, $3, 'e') RETURNING id`, [p, dev, addDays(today, 5)]);
    await cycle(p, addDays(today, -1));
    await id("INSERT INTO phs.health_task(project_id, title, owner_id, due_on, priority) VALUES($1, 'Llamar al cliente', $2, $3, 'medium') RETURNING id", [p, pm, addDays(today, -1)]);
    await governance.sync(p);
    scope = [listed(p, 'Del PM', PM)];
    const view = await center.view(pm, 'x');
    expect(() => healthCenter.strict().parse(view)).not.toThrow();
    expect(view.incomplete).toBe(false);
    expect(view.projects[0]).toMatchObject({
      id: p, mine: true, assessed: true, review: { status: 'overdue', dueOn: addDays(today, -1) },
      counts: { criticalAlerts: 1, upcomingMilestones: 1, upcomingRisks: 1, pendingDecisions: 0 },
    });
    expect(view.projects[0]!.counts.overdueActions).toBeGreaterThanOrEqual(1);
    expect(view.focus.map((f) => [f.kind, f.severity, f.subject ?? f.count, f.tab])).toEqual([
      // Critical first, by deadline: the PM's own overdue actions (manual and the one for the late review), the review, the alerts.
      ['my_action', 'critical', 'Llamar al cliente', 'alerts'],
      ['review_overdue', 'critical', 1, 'reviews'],
      ['my_action', 'warning', `Enviar la revisión vencida el ${addDays(today, -1)}`, 'alerts'],
      ['alerts_untreated', 'critical', 1, 'alerts'],
      ['risk_due', 'warning', 'Proveedor', 'risks'],
      ['milestone_due', 'info', 'Entrega próxima', 'milestones'],
    ].sort((a, b) => ['critical', 'warning', 'info'].indexOf(a[1] as string) - ['critical', 'warning', 'info'].indexOf(b[1] as string)));
    // The PM is not told that their own project is at risk as if it were news: the causes are listed instead.
    expect(view.focus.some((f) => f.kind === 'project_at_risk')).toBe(false);
  });

  it('shows the lead where to decide and where to look, without the PM chores', async () => {
    const p = await project('Del líder');
    await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on, critical) VALUES($1, 'Vencido crítico', $2, $3, true) RETURNING id", [p, dev, addDays(today, -2)]);
    const c = await cycle(p, addDays(today, 2));
    await id(`INSERT INTO phs.health_review(project_id, cycle_id, revision_no, author_id, effective_on, nothing_changed, topics, submitted_data, expectations_snapshot)
              VALUES($1, $2, 1, $3, $4, true, '{}', '{}', '[]') RETURNING id`, [p, c, pm, today]);
    await id(`INSERT INTO phs.project_change(project_id, title, description, change_type, proposed_by, requested_impact) VALUES($1, 'Mover', 'Motivo', 'internal', $2, '{}') RETURNING id`, [p, pm]);
    await governance.sync(p);
    scope = [listed(p, 'Del líder', LEAD)];
    const view = await center.view(dev, 'x');
    expect(view.projects[0]).toMatchObject({ mine: false, band: 'risk', review: { status: 'submitted' }, counts: { pendingDecisions: 2 } });
    const kinds = view.focus.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['project_at_risk', 'review_to_validate', 'change_to_decide', 'alerts_untreated']));
    expect(kinds).not.toContain('milestone_due');
    expect(view.focus[0]?.severity).toBe('critical');
    expect(view.focus.find((f) => f.kind === 'project_at_risk')).toMatchObject({ tab: 'health', subject: view.projects[0]!.score });

    // Someone who only consults sees the state, not decisions that are not theirs.
    scope = [listed(p, 'Del líder', NONE)];
    const reader = await center.view(dev, 'x');
    expect(reader.projects[0]?.counts.pendingDecisions).toBe(0);
    expect(reader.focus.map((f) => f.kind)).not.toEqual(expect.arrayContaining(['review_to_validate']));
    // A project with almost no data is never presented as healthy, and what is flagged says why to look.
    const empty = await project('Vacío');
    scope = [listed(empty, 'Vacío', NONE)];
    const blank = await center.view(dev, 'x');
    expect(blank.projects[0]).toMatchObject({ assessed: true, review: null, confidenceLevel: 'low' });
    expect(blank.projects[0]?.band).not.toBe('healthy');
    expect(blank.focus.map((f) => f.kind).sort()).toEqual(['low_confidence', 'project_in_attention']);
  });
});
