import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseUrl = process.env.PHS_E2E_URL ?? 'http://127.0.0.1:3000';
const password = process.env.DEMO_USER_PASSWORD;
if (!password) throw new Error('DEMO_USER_PASSWORD is required');

const today = new Date().toISOString().slice(0, 10);
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const runId = Date.now().toString(36).toUpperCase();
const results = [];

class HttpFailure extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path}: ${status} ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function request(session, method, path, body, idempotencyKey) {
  const headers = {};
  if (session?.cookie) headers.cookie = session.cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  if (!response.ok) throw new HttpFailure(method, path, response.status, data);
  return data;
}

async function formRequest(session, path, form) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { cookie: session.cookie }, body: form });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  if (!response.ok) throw new HttpFailure('POST', path, response.status, data);
  return data;
}

async function login(localPart) {
  const response = await fetch(`${baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${localPart}@phs.test`, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new HttpFailure('POST', '/api/v1/session', response.status, data);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie, `login ${localPart} did not return a session cookie`);
  return { cookie, user: data.user };
}

async function expectFailure(action, status, code) {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof HttpFailure, `expected HTTP ${status}/${code}, got ${error}`);
    assert.equal(error.status, status);
    assert.equal(error.body?.code, code);
    return error;
  }
  assert.fail(`expected HTTP ${status}/${code}`);
}

async function check(id, title, action) {
  const started = performance.now();
  try {
    const detail = await action();
    results.push({ id, title, status: 'PASS', ms: Math.round(performance.now() - started), detail: detail ?? '' });
  } catch (error) {
    results.push({ id, title, status: 'FAIL', ms: Math.round(performance.now() - started), detail: error instanceof Error ? error.message : String(error) });
  }
}

const status = await request(null, 'GET', '/api/v1/status');
assert.ok(status.services.every((service) => service.status === 'ok' && service.database === 'ok'));

const [ana, luis, pablo, carla, diego] = await Promise.all([
  login('ana.pm'), login('luis.lider'), login('pablo.pm'), login('carla.direccion'), login('diego.dev'),
]);

let demo001;
let demo006;
let demo002;
let demo004;
await check('E2E-01', 'Autenticación, salud de servicios y alcance por práctica', async () => {
  const [anaProjects, pabloProjects, carlaProjects] = await Promise.all([
    request(ana, 'GET', '/api/v1/projects?page=1&pageSize=50'),
    request(pablo, 'GET', '/api/v1/projects?page=1&pageSize=50'),
    request(carla, 'GET', '/api/v1/projects?page=1&pageSize=50'),
  ]);
  demo001 = anaProjects.items.find((project) => project.code === 'DEMO-001');
  demo002 = anaProjects.items.find((project) => project.code === 'DEMO-002');
  demo004 = pabloProjects.items.find((project) => project.code === 'DEMO-004');
  demo006 = anaProjects.items.find((project) => project.code === 'DEMO-006');
  assert.ok(demo001 && demo002 && demo004 && demo006);
  assert.ok(!anaProjects.items.some((project) => project.code === 'DEMO-004'));
  assert.deepEqual(pabloProjects.items.map((project) => project.code), ['DEMO-004']);
  assert.equal(carlaProjects.items.filter((project) => project.code.startsWith('DEMO-')).length, 6);
  await expectFailure(() => request(pablo, 'GET', `/api/v1/projects/${demo001.id}`), 404, 'not_found');
  return `${anaProjects.total} proyectos PM; ${pabloProjects.total} de otra práctica; 6 fixtures DEMO visibles para Dirección`;
});

await check('E2E-02', 'Fixtures repetibles: riesgo, saludable con renovación, sin revisión y con tendencia', async () => {
  const [risk, healthy, renewals, noReview, trending] = await Promise.all([
    request(ana, 'GET', `/api/v1/assessments/${demo001.id}`),
    request(ana, 'GET', `/api/v1/assessments/${demo002.id}`),
    request(ana, 'GET', `/api/v1/projects/${demo002.id}/renewals`),
    request(pablo, 'GET', `/api/v1/governance/projects/${demo004.id}/review-schedule`),
    request(ana, 'GET', `/api/v1/assessments/${demo006.id}/outlook`),
  ]);
  assert.equal(risk.band, 'risk');
  assert.equal(healthy.band, 'healthy', `DEMO-002 expected healthy, got ${healthy.band} (${healthy.score})`);
  assert.ok(renewals.some((renewal) => renewal.status === 'pending'));
  assert.equal(noReview.policy, null);
  assert.equal(noReview.cycles.length, 0);
  // The trend fixture has two official cuts, both in the past, and DEMO-002 is not used for it.
  assert.ok(trending.trend.direction, `DEMO-006 has no comparable trend: ${trending.trend.reason}`);
  assert.ok(trending.trend.current.cycleDueOn < trending.today && trending.trend.previous.cycleDueOn < trending.trend.current.cycleDueOn);
});

const practiceId = ana.user.memberships.find((membership) => membership.role === 'pm')?.practiceId;
assert.ok(practiceId);
const people = await request(ana, 'GET', `/api/v1/people?practiceId=${practiceId}`);
const lead = people.find((person) => person.email === 'luis.lider@phs.test');
const developer = people.find((person) => person.email === 'diego.dev@phs.test');
assert.ok(lead && developer);

let project;
let milestones;
let baseline1;
await check('E2E-03', 'Alta de proyecto, equipo, hitos y línea base con idempotencia', async () => {
  const input = {
    practiceId,
    code: `E2E-${runId}`,
    name: `Recorrido integral ${runId}`,
    description: 'Proyecto sintético creado por PHS-040.',
    clientName: `Cliente E2E ${runId}`,
    serviceTypeCode: 'development',
    pmId: ana.user.id,
    leadId: lead.id,
    technicalOwnerId: developer.id,
    sponsorId: null,
    clientContact: 'qa@example.invalid',
    escalationNotes: 'Datos sintéticos de prueba.',
    startsOn: day(-30),
    endsOn: day(90),
  };
  const key = randomUUID();
  project = await request(ana, 'POST', '/api/v1/projects', input, key);
  const retried = await request(ana, 'POST', '/api/v1/projects', input, key);
  assert.equal(retried.id, project.id);
  await request(ana, 'PUT', `/api/v1/projects/${project.id}/members/${developer.id}`, { role: 'contributor', allocationPct: 80 });
  milestones = [];
  for (const item of [
    ['Entrega vencida', 'Paquete crítico', day(-1), true],
    ['Entrega seleccionada', 'Paquete que cambiará', day(20), false],
    ['Entrega intacta', 'Paquete de control', day(40), false],
  ]) {
    milestones.push(await request(ana, 'POST', `/api/v1/projects/${project.id}/milestones`, {
      title: item[0], deliverable: item[1], ownerId: developer.id, dueOn: item[2], critical: item[3],
    }, randomUUID()));
  }
  project = await request(ana, 'GET', `/api/v1/projects/${project.id}`);
  baseline1 = await request(ana, 'POST', `/api/v1/projects/${project.id}/baselines`, {
    expectedRevision: project.revision, scope: 'Tres entregas del escenario E2E.', budget: '100000', effortHours: '1000',
  }, randomUUID());
  assert.equal(baseline1.version, 1);
  assert.equal(baseline1.milestones.length, 3);
  project = await request(ana, 'GET', `/api/v1/projects/${project.id}`);
  project = await request(ana, 'POST', `/api/v1/projects/${project.id}/status`, {
    expectedRevision: project.revision, to: 'active', reason: 'Inicio del escenario integral.',
  });
  return project.code;
});

await check('E2E-04', 'Operación: economía, riesgo, evidencia y permisos cruzados', async () => {
  const operationalMilestones = await request(ana, 'GET', `/api/v1/projects/${project.id}/milestones`);
  for (const milestone of operationalMilestones) {
    const started = await request(ana, 'POST', `/api/v1/projects/${project.id}/milestones/${milestone.id}/transition`, {
      expectedRevision: milestone.revision, to: 'in_progress',
    });
    await request(ana, 'PATCH', `/api/v1/projects/${project.id}/milestones/${milestone.id}`, {
      expectedRevision: started.revision, progressPct: 50,
    });
  }
  await request(ana, 'POST', `/api/v1/projects/${project.id}/finance`, {
    effectiveOn: today, totalCost: '54000', totalEffortHours: '480', source: 'Prueba AT-09', supersedesId: null,
  }, randomUUID());
  const risk = await request(ana, 'POST', `/api/v1/projects/${project.id}/risks`, {
    title: 'Dependencia externa', description: 'Proveedor sin fecha firme.', riskType: 'project', category: 'supplier',
    probability: 3, impact: 3, ownerId: developer.id, mitigationDueOn: day(-1), strategy: 'Escalar y preparar alternativa.',
  }, randomUUID());
  const form = new FormData();
  form.set('projectId', project.id); form.set('kind', 'risk'); form.set('targetId', risk.id);
  form.set('text', 'Minuta sintética de seguimiento.');
  const evidence = await formRequest(ana, '/api/v1/evidence', form);
  assert.ok(evidence.id);
  const invalid = new FormData();
  invalid.set('projectId', project.id); invalid.set('kind', 'risk'); invalid.set('targetId', risk.id);
  invalid.set('file', new Blob(['not really a PNG'], { type: 'image/png' }), 'falsa.png');
  await expectFailure(() => formRequest(ana, '/api/v1/evidence', invalid), 400, 'file_type_not_allowed');
  await expectFailure(() => request(pablo, 'GET', `/api/v1/evidence?projectId=${project.id}&kind=risk&targetId=${risk.id}`), 404, 'not_found');
  const finance = await request(ana, 'GET', `/api/v1/projects/${project.id}/finance`);
  assert.equal(finance.deviation, '4.00');
});

await check('E2E-05', 'Cambio aprobado crea baseline N+1 y conserva compromisos no seleccionados', async () => {
  const selected = milestones[1];
  const untouched = milestones[2];
  const change = await request(ana, 'POST', `/api/v1/projects/${project.id}/changes`, {
    title: 'Mover una entrega', description: 'Dependencia confirmada por el proveedor.', changeType: 'technical',
    impact: { milestones: [{ id: selected.id, dueOn: day(30) }] },
  }, randomUUID());
  const decided = await request(luis, 'POST', `/api/v1/projects/${project.id}/changes/${change.id}/decision`, {
    decision: 'approved', comment: 'Impacto revisado y aceptado.',
  }, randomUUID());
  assert.equal(decided.decision.baselineVersion, 2);
  const baselines = await request(ana, 'GET', `/api/v1/projects/${project.id}/baselines`);
  assert.equal(baselines.length, 2);
  const v1 = baselines.find((baseline) => baseline.version === 1);
  const v2 = baselines.find((baseline) => baseline.version === 2);
  assert.equal(v1.milestones.find((item) => item.id === selected.id).due_on, selected.dueOn);
  assert.equal(v2.milestones.find((item) => item.id === selected.id).due_on, day(30));
  assert.equal(v2.milestones.find((item) => item.id === untouched.id).due_on, untouched.dueOn);
});

await check('E2E-06', 'Conflicto de edición y decisión concurrente', async () => {
  const current = await request(ana, 'GET', `/api/v1/projects/${project.id}`);
  const edits = await Promise.allSettled([
    request(ana, 'PATCH', `/api/v1/projects/${project.id}`, { expectedRevision: current.revision, escalationNotes: 'Edición concurrente A' }),
    request(ana, 'PATCH', `/api/v1/projects/${project.id}`, { expectedRevision: current.revision, escalationNotes: 'Edición concurrente B' }),
  ]);
  assert.equal(edits.filter((result) => result.status === 'fulfilled').length, 1);
  const rejectedEdit = edits.find((result) => result.status === 'rejected');
  assert.ok(rejectedEdit.reason instanceof HttpFailure);
  assert.equal(rejectedEdit.reason.status, 409);
  assert.equal(rejectedEdit.reason.body?.code, 'revision_conflict');

  const change = await request(ana, 'POST', `/api/v1/projects/${project.id}/changes`, {
    title: 'Decisión concurrente', description: 'Solo una decisión debe persistir.', changeType: 'internal',
    impact: { scope: 'Alcance ajustado', milestones: [] },
  }, randomUUID());
  const decisions = await Promise.allSettled([
    request(luis, 'POST', `/api/v1/projects/${project.id}/changes/${change.id}/decision`, { decision: 'approved', comment: 'Aprobado A' }, randomUUID()),
    request(luis, 'POST', `/api/v1/projects/${project.id}/changes/${change.id}/decision`, { decision: 'rejected', comment: 'Rechazado B' }, randomUUID()),
  ]);
  assert.equal(decisions.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(decisions.filter((result) => result.status === 'rejected').length, 1);
});

let validatedReview;
await check('E2E-07', 'Review: falta de soporte, envío idempotente, devolución, reenvío y validación', async () => {
  const configured = await request(ana, 'PUT', `/api/v1/governance/projects/${project.id}/review-policy`, {
    cadence: 'weekly', nextDueOn: today, forecastCycles: 2, evidenceRequired: true,
    leadValidationRequired: true, autoTasks: true, expectedRevision: 0,
  });
  const cycle = configured.cycles[0];
  const payload = {
    nothingChanged: false, topics: ['schedule', 'risks'],
    notes: { schedule: 'Se mantiene la fecha aprobada.', risks: 'Se escaló la dependencia.' },
    clientClimate: null, supportText: '', activeSeconds: 45, declaredConfidence: 'high', finance: null,
    expectedProjectRevision: cycle.projectRevision,
  };
  await expectFailure(() => request(ana, 'POST', `/api/v1/governance/cycles/${cycle.id}/reviews`, payload, randomUUID()), 400, 'support_required');
  const key = randomUUID();
  const sent = await request(ana, 'POST', `/api/v1/governance/cycles/${cycle.id}/reviews`, { ...payload, supportText: 'Minuta E2E.' }, key);
  const retried = await request(ana, 'POST', `/api/v1/governance/cycles/${cycle.id}/reviews`, { ...payload, supportText: 'Minuta E2E.' }, key);
  assert.equal(retried.reviews[0].id, sent.reviews[0].id);
  const returned = await request(luis, 'POST', `/api/v1/governance/reviews/${sent.reviews[0].id}/validation`, {
    decision: 'returned', comment: 'Agregar la fecha del escalamiento.',
  });
  assert.equal(returned.status, 'returned');
  const corrected = await request(ana, 'POST', `/api/v1/governance/cycles/${cycle.id}/reviews`, {
    ...payload, supportText: 'Minuta E2E con escalamiento del 2026-10-05.', expectedProjectRevision: returned.projectRevision,
  }, randomUUID());
  assert.equal(corrected.reviews.length, 2);
  validatedReview = await request(luis, 'POST', `/api/v1/governance/reviews/${corrected.reviews[0].id}/validation`, {
    decision: 'validated', comment: 'Corrección completa.',
  });
  assert.equal(validatedReview.status, 'validated');
});

await check('E2E-08', 'Evento, acción automática, causa y plan con validación', async () => {
  const calls = await Promise.all([
    request(ana, 'GET', `/api/v1/governance/projects/${project.id}/events`),
    request(luis, 'GET', `/api/v1/governance/projects/${project.id}/events`),
    request(diego, 'GET', `/api/v1/governance/projects/${project.id}/tasks`),
  ]);
  const events = calls[0];
  const overdue = events.find((event) => event.ruleKey === 'milestone_overdue');
  assert.ok(overdue?.task);
  assert.equal(events.filter((event) => event.ruleKey === 'milestone_overdue' && !event.resolvedAt).length, 1);
  const responded = await request(ana, 'POST', `/api/v1/governance/events/${overdue.id}/responses`, {
    cause: 'El proveedor incumplió la fecha.', kind: 'remediation', plan: 'Escalar y entregar un simulador.', changeId: null,
  });
  const validated = await request(luis, 'POST', `/api/v1/governance/responses/${responded.response.id}/validation`, {
    decision: 'validated', comment: 'Plan verificable.',
  });
  assert.equal(validated.responseStatus, 'validated');
});

await check('E2E-09', 'Evaluación, gobierno e historial reflejan el recorrido', async () => {
  const [assessment, history, timeline, center, portfolio] = await Promise.all([
    request(ana, 'GET', `/api/v1/assessments/${project.id}`),
    request(ana, 'GET', `/api/v1/history?projectId=${project.id}`),
    request(ana, 'GET', `/api/v1/history/timeline?projectId=${project.id}`),
    request(ana, 'GET', '/api/v1/governance/center'),
    request(ana, 'GET', '/api/v1/governance/portfolio'),
  ]);
  assert.ok(assessment.score !== null && assessment.gates.some((gate) => gate.active));
  assert.ok(history.items.some((item) => item.action === 'review.submitted'));
  assert.ok(history.items.some((item) => item.action === 'change.approved'));
  assert.ok(timeline.past.length > 0 || timeline.overdue.length > 0);
  assert.ok(center.projects.some((item) => item.id === project.id));
  assert.ok(portfolio.projects.some((item) => item.id === project.id));
});

await check('E2E-10', 'Un ciclo futuro no puede enviarse antes de comenzar', async () => {
  const schedule = await request(ana, 'GET', `/api/v1/governance/projects/${project.id}/review-schedule`);
  const future = schedule.cycles.find((cycle) => cycle.startsOn > today && cycle.status === 'open');
  assert.ok(future, 'no future open cycle was generated');
  assert.equal(future.canSubmit, false, `future cycle ${future.startsOn}..${future.dueOn} is marked submittable`);
  assert.equal(future.started, false);
  // The server refuses it too when the command is called directly, and nothing is stored.
  const early = { nothingChanged: true, topics: [], notes: {}, clientClimate: null, supportText: '', activeSeconds: 5, declaredConfidence: null, finance: null };
  await expectFailure(() => request(ana, 'POST', `/api/v1/governance/cycles/${future.id}/reviews`, { ...early, expectedProjectRevision: future.projectRevision }, randomUUID()), 409, 'cycle_not_started');
  await expectFailure(() => request(ana, 'PUT', `/api/v1/governance/cycles/${future.id}/draft`, { expectedRevision: 0, payload: early }), 409, 'cycle_not_started');
  const after = await request(ana, 'GET', `/api/v1/governance/cycles/${future.id}`);
  assert.equal(after.reviews.length, 0);
  assert.equal(after.draft, null);
});

for (const session of [ana, luis, pablo, carla, diego]) {
  await request(session, 'DELETE', '/api/v1/session').catch(() => undefined);
}

console.table(results);
const failed = results.filter((result) => result.status === 'FAIL');
console.log(JSON.stringify({ runId, today, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
