// Detects the demo projects' alerts and loads a response and a manual action. Safe to run again.
// The seed is trusted: it stands in for the Projects service when asked what the user may do.
import { randomUUID } from 'node:crypto';
import { createPool, loadEnv, requireEnv, type ProjectCapabilities } from '@phs/service-kit';
import { AssessmentsService } from '../assessments.service.js';
import { GovernanceService } from '../governance.service.js';
import type { ProjectsClient } from '../projects.client.js';

loadEnv();
const pool = createPool(requireEnv('HEALTH_DATABASE_URL'));
const all: ProjectCapabilities = { view: true, editOperation: true, proposeAndReview: true, decide: true, seeFinancials: true };
const trusted = { access: async (_identity: string, id: string) => ({ id, capabilities: all }) } as ProjectsClient;
const governance = new GovernanceService(pool, trusted, new AssessmentsService(pool, trusted));

try {
  const projects = await pool.query<{ id: string; code: string; pm_id: string; lead_id: string }>(
    "SELECT id, code, pm_id, lead_id FROM phs.project WHERE code LIKE 'DEMO-%' ORDER BY code");
  for (const p of projects.rows) await governance.sync(p.id);
  console.log(`Alertas detectadas en ${projects.rowCount} proyectos de demostración`);

  const portal = projects.rows.find((p) => p.code === 'DEMO-001');
  if (portal) {
    const actor = (userId: string) => ({ userId, requestId: randomUUID(), identity: 'seed' });
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
  console.log('Alertas y acciones de demostración listas');
} finally {
  await pool.end();
}
