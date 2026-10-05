// Detects the demo projects' alerts and loads responses, actions and review cycles. Safe to run again.
// The seed is trusted: it stands in for the Projects service when asked what the user may do.
import { randomUUID } from 'node:crypto';
import { RULE_SET_DEFINITION, RULE_SET_VERSION, assess } from '@phs/health-engine';
import { createPool, loadEnv, requireEnv, type ProjectCapabilities } from '@phs/service-kit';
import { AssessmentsService } from '../assessments.service.js';
import { addDays, skipHolidays } from '../cadence.js';
import { GovernanceService } from '../governance.service.js';
import { HolidayService } from '../holiday.service.js';
import type { ProjectsClient } from '../projects.client.js';
import { ReviewService, type PolicyInput } from '../review.service.js';

loadEnv();
const pool = createPool(requireEnv('HEALTH_DATABASE_URL'));
const all: ProjectCapabilities = { view: true, editOperation: true, proposeAndReview: true, decide: true, seeFinancials: true };
const trusted = { access: async (_identity: string, id: string) => ({ id, capabilities: all }) } as ProjectsClient;
const assessments = new AssessmentsService(pool, trusted);
const governance = new GovernanceService(pool, trusted, assessments);
const reviews = new ReviewService(pool, trusted, governance, assessments);

try {
  const projects = await pool.query<{ id: string; code: string; pm_id: string; lead_id: string; today: string; configured: boolean }>(
    `SELECT id, code, pm_id, lead_id, (now() AT TIME ZONE timezone)::date::text AS today,
            EXISTS (SELECT 1 FROM phs.review_policy rp WHERE rp.project_id = project.id) AS configured FROM phs.project WHERE code LIKE 'DEMO-%' ORDER BY code`);
  for (const p of projects.rows) await governance.sync(p.id);
  console.log(`Alertas detectadas en ${projects.rowCount} proyectos de demostración`);

  const actor = (userId: string) => ({ userId, requestId: randomUUID(), identity: 'seed' });
  const portal = projects.rows.find((p) => p.code === 'DEMO-001');
  if (portal) {
    const events = await governance.events(actor(portal.pm_id), portal.id);
    // One alert answered and waiting for the lead; the others still need cause and plan.
    const overdue = events.find((e) => e.ruleKey === 'milestone_overdue' && e.responseStatus === 'missing');
    const answered = events.some((e) => e.response !== null);
    if (overdue && !answered) {
      await governance.respond(actor(portal.pm_id), overdue.id, {
        cause: 'El proveedor de facturación no entregó su API en la fecha acordada.', kind: 'remediation',
        plan: 'Construir un simulador de la API esta semana y validar la integración real en cuanto el proveedor entregue.', changeId: null,
      });
      console.log('Respuesta de causa y plan cargada en DEMO-001 (en validación del líder)');
    }
    const manual = await pool.query("SELECT 1 FROM phs.health_task WHERE project_id = $1 AND NOT automatic LIMIT 1", [portal.id]);
    if (!manual.rowCount) {
      const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      await governance.createTask(actor(portal.pm_id), portal.id, {
        title: 'Reunión de escalación con el proveedor de facturación', description: 'Acordar una fecha firme de entrega de la API.',
        ownerId: portal.lead_id, dueOn: due, priority: 'high', eventId: null,
      }, randomUUID());
      console.log('Acción manual cargada en DEMO-001');
    }
  }
  // Official holidays in Mexico for this year and the next, so the review calendar skips them.
  const admin = (await pool.query<{ id: string }>('SELECT id FROM phs.app_user WHERE is_admin AND active ORDER BY created_at LIMIT 1')).rows[0];
  if (admin) {
    const holidays = new HolidayService(pool);
    const days: [string, string][] = [
      ['2026-01-01', 'Año Nuevo'], ['2026-02-02', 'Día de la Constitución'], ['2026-03-16', 'Natalicio de Benito Juárez'], ['2026-05-01', 'Día del Trabajo'],
      ['2026-09-16', 'Día de la Independencia'], ['2026-11-16', 'Día de la Revolución'], ['2026-12-25', 'Navidad'],
      ['2027-01-01', 'Año Nuevo'], ['2027-02-01', 'Día de la Constitución'], ['2027-03-15', 'Natalicio de Benito Juárez'], ['2027-05-01', 'Día del Trabajo'],
      ['2027-09-16', 'Día de la Independencia'], ['2027-11-15', 'Día de la Revolución'], ['2027-12-25', 'Navidad'],
    ];
    for (const [day, name] of days) await holidays.add(admin.id, randomUUID(), { day, name });
    console.log('Días festivos de 2026 y 2027 cargados');
  }

  // Review cycles (PHS-020 to PHS-024), one project per situation. DEMO-004 stays without a cycle
  // and DEMO-005 is paused, so both show what an unconfigured project looks like.
  const policy = (cadence: PolicyInput['cadence'], nextDueOn: string) => ({
    cadence, nextDueOn, forecastCycles: 2, evidenceRequired: true, leadValidationRequired: true, autoTasks: true, expectedRevision: 0,
  });
  const fresh = (code: string) => projects.rows.find((p) => p.code === code && !p.configured);
  const drafted = fresh('DEMO-001');
  if (drafted) {
    // Open cycle with a draft in progress; "nothing changed" is blocked by its critical alerts.
    const { cycles: [cycle] } = await reviews.savePolicy(actor(drafted.pm_id), drafted.id, policy('weekly', addDays(drafted.today, 2)));
    await reviews.saveDraft(actor(drafted.pm_id), cycle!.id, { expectedRevision: 0, payload: {
      nothingChanged: false, topics: ['milestones'], notes: { milestones: 'La integración con facturación sigue detenida por el proveedor.' },
      clientClimate: null, supportText: '', activeSeconds: 90, declaredConfidence: null, finance: null,
    } });
    console.log('DEMO-001: ciclo semanal abierto con borrador');
  }
  const waiting = fresh('DEMO-002');
  if (waiting) {
    // Submitted and waiting for the lead.
    const { cycles: [cycle] } = await reviews.savePolicy(actor(waiting.pm_id), waiting.id, policy('fortnightly', addDays(waiting.today, 1)));
    await reviews.submit(actor(waiting.pm_id), cycle!.id, {
      nothingChanged: false, topics: ['milestones', 'client'],
      notes: { milestones: 'Se migraron dos de los cinco ambientes; el tercero inicia la próxima semana.', client: 'El cliente pidió más visibilidad del plan de corte.' },
      clientClimate: 'tense', supportText: 'Minuta del comité de seguimiento y correo del cliente.', activeSeconds: 420,
      expectedProjectRevision: cycle!.projectRevision, declaredConfidence: 'medium', finance: null,
    }, randomUUID());
    console.log('DEMO-002: revisión enviada, en validación del líder');
  }
  const returned = fresh('DEMO-003');
  if (returned) {
    // Submitted and returned: the PM has a correction to make.
    const { cycles: [cycle] } = await reviews.savePolicy(actor(returned.pm_id), returned.id, policy('monthly', returned.today));
    const sent = await reviews.submit(actor(returned.pm_id), cycle!.id, {
      nothingChanged: false, topics: ['team'], notes: { team: 'Se incorporó un analista de soporte.' }, clientClimate: null,
      supportText: 'Correo de asignación.', activeSeconds: 150, expectedProjectRevision: cycle!.projectRevision, declaredConfidence: null, finance: null,
    }, randomUUID());
    await reviews.validate(actor(returned.lead_id), sent.reviews[0]!.id, { decision: 'returned', comment: 'Falta indicar desde cuándo y con qué dedicación.' });
    console.log('DEMO-003: revisión devuelta por el líder, con acción de corrección');
  }
  // DEMO-006: two review cycles already in the past, so the trend between cycles has something to
  // compare (PHS-028). EXCEPTION to the rule of loading demo data through the services, approved by
  // the user on 2026-10-05 (BIT-0033): the services never accept a review dated in the past, nor of a
  // cycle that has not started, so these rows are written directly, with their real past dates.
  const steady = fresh('DEMO-006');
  const loaded = steady ? await assessments.inputs(pool, steady.id) : null;
  if (steady && loaded?.baselineId) {
    const due3 = skipHolidays(steady.today, new Set((await pool.query<{ day: string }>('SELECT day::text AS day FROM phs.holiday')).rows.map((r) => r.day)));
    const snapshot = JSON.stringify({ cadence: 'weekly', forecastCycles: 2, evidenceRequired: true, leadValidationRequired: true });
    await pool.query(
      `INSERT INTO phs.review_policy(project_id, cadence, anchor_on, forecast_cycles, updated_by) VALUES($1, 'weekly', $2, 2, $3)`, [steady.id, due3, steady.pm_id]);
    await pool.query(
      `INSERT INTO phs.rule_set(version, definition, engine_version, created_by) VALUES($1, $2, $1, $3) ON CONFLICT (version) DO NOTHING`,
      [RULE_SET_VERSION, JSON.stringify(RULE_SET_DEFINITION), steady.pm_id]);
    // Two weeks ago the client was tense; last week things were back to normal.
    const past = [
      { dueOn: addDays(due3, -14), climate: 'tense' as const, topics: ['client', 'risks'], support: 'Minuta: el cliente reclamó tiempos de respuesta en segundo nivel.' },
      { dueOn: addDays(due3, -7), climate: 'good' as const, topics: ['client'], support: 'Correo del cliente confirmando que los tiempos volvieron al nivel acordado.' },
    ];
    for (const cut of past) {
      const at = `${cut.dueOn}T18:00:00Z`;
      const cycle = (await pool.query<{ id: string }>(
        'INSERT INTO phs.review_cycle(project_id, starts_on, due_on, policy_snapshot) VALUES($1, $2, $3, $4) RETURNING id',
        [steady.id, addDays(cut.dueOn, -6), cut.dueOn, snapshot])).rows[0]!.id;
      const review = (await pool.query<{ id: string }>(
        `INSERT INTO phs.health_review(project_id, cycle_id, revision_no, author_id, submitted_at, effective_on, nothing_changed, topics, client_climate,
                                       support_text, duration_seconds, submitted_data, expectations_snapshot)
         VALUES($1, $2, 1, $3, $4, $5, false, $6, $7, $8, 180, $9, '[]') RETURNING id`,
        [steady.id, cycle, steady.pm_id, at, cut.dueOn, cut.topics, cut.climate, cut.support,
          JSON.stringify({ notes: {}, projectRevision: loaded.revision, declaredConfidence: 'high', finance: null })])).rows[0]!.id;
      await pool.query(
        `INSERT INTO phs.review_validation(review_id, decision, validator_id, decided_at, comment) VALUES($1, 'validated', $2, $3::timestamptz + interval '1 day', 'Revisión completa.')`,
        [review, steady.lead_id, at]);
      const input = { ...loaded.input, today: cut.dueOn, client: { ...loaded.input.client, climate: cut.climate } };
      const result = assess(input);
      await pool.query(
        `INSERT INTO phs.health_assessment(project_id, baseline_id, rule_set_id, effective_on, calculated_at, project_revision, assessment_kind, publication,
                                           score, weighted_score, gate_cap, confidence, dimension_results, gate_results, input_snapshot, forecast,
                                           idempotency_key, cycle_id, review_id)
         SELECT $1, $2, rs.id, $3, $4, $5, 'cycle', 'official', $6, $7, $8, $9, $10, $11, $12, '{}', $13, $14, $15 FROM phs.rule_set rs WHERE rs.version = $16`,
        [steady.id, loaded.baselineId, cut.dueOn, at, loaded.revision, result.score, result.weightedScore, result.gateCap, result.confidence.value,
          JSON.stringify({ dimensions: result.dimensions, band: result.band, confidenceLevel: result.confidence.level, confidenceDeductions: result.confidence.deductions, metrics: result.metrics }),
          JSON.stringify(result.gates), JSON.stringify(input), `cycle:${review}`, cycle, review, RULE_SET_VERSION]);
      await pool.query(
        `INSERT INTO phs.audit_entry(actor_id, request_id, action, entity_type, entity_id, after_data, project_id, occurred_at)
         VALUES($1, $2, 'review.submitted', 'health_review', $3, $4, $5, $6)`,
        [steady.pm_id, randomUUID(), review, JSON.stringify({ cycleId: cycle, revisionNo: 1, nothingChanged: false, topics: cut.topics }), steady.id, at]);
    }
    // The cycle in progress, waiting for this week's review.
    await pool.query('INSERT INTO phs.review_cycle(project_id, starts_on, due_on, policy_snapshot) VALUES($1, $2, $3, $4)', [steady.id, addDays(due3, -6), due3, snapshot]);
    await governance.sync(steady.id);
    console.log('DEMO-006: dos ciclos anteriores cargados con fecha pasada; la tendencia compara dos cortes');
  }
  console.log('Alertas, acciones y revisiones de demostración listas');
} finally {
  await pool.end();
}
