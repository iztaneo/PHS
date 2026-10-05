// Detects the demo projects' alerts and loads a response and a manual action. Safe to run again.
// The seed is trusted: it stands in for the Projects service when asked what the user may do.
import { randomUUID } from 'node:crypto';
import { createPool, loadEnv, requireEnv, type ProjectCapabilities } from '@phs/service-kit';
import { AssessmentsService } from '../assessments.service.js';
import { addDays } from '../cadence.js';
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
  console.log('Alertas, acciones y revisiones de demostración listas');
} finally {
  await pool.end();
}
