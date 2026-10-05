import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ApiError, api, errorMessage, type Cadence, type Climate, type ConfidenceLevel, type DraftPayload, type Expectation, type PracticePerson,
  type ProjectDetail, type Review, type ReviewCycle, type ReviewPolicyInput, type ReviewSchedule, type ReviewTopic,
} from './api';
import { Changes } from './Changes';
import { EvidencePanel } from './EvidencePanel';
import { Milestones, Team } from './ProjectSections';
import { Risks } from './RiskFinance';
import { Badge, Button, Card, Empty, Facts, Field, Input, Loading, Notice, Select, Textarea, type Tone } from './ui';

const CADENCE: Record<Cadence, string> = { weekly: 'Semanal', fortnightly: 'Quincenal', monthly: 'Mensual (mes calendario)' };
const STATUS: Record<ReviewCycle['status'], { label: string; tone: Tone }> = {
  open: { label: 'Por enviar', tone: 'blue' }, overdue: { label: 'Vencida', tone: 'red' }, submitted: { label: 'En validación del líder', tone: 'amber' },
  returned: { label: 'Devuelta: hay que corregir', tone: 'red' }, validated: { label: 'Validada', tone: 'green' }, closed: { label: 'Enviada', tone: 'green' },
};
const TOPICS: [ReviewTopic, string][] = [
  ['schedule', 'Cronograma'], ['milestones', 'Hitos'], ['risks', 'Riesgos'], ['client', 'Cliente'], ['finance', 'Finanzas'], ['scope', 'Alcance'], ['team', 'Equipo'],
];
// What the review screen needs from the project page to open each topic in place.
export interface ReviewContext { project: ProjectDetail; people: PracticePerson[]; onChanged: () => void; onNavigate: (tab: string) => void }
const TOPIC = Object.fromEntries(TOPICS) as Record<ReviewTopic, string>;
const CLIMATE: Record<Climate, string> = { good: 'Bueno', tense: 'Tenso', critical: 'Crítico' };
const KIND: Record<Expectation['kind'], string> = {
  alert: 'Alerta crítica', milestone: 'Hito', risk: 'Mitigación', task: 'Acción', renewal: 'Renovación', change: 'Cambio por decidir',
};
const BAND: Record<string, { label: string; tone: Tone }> = {
  healthy: { label: 'Saludable', tone: 'green' }, attention: { label: 'En atención', tone: 'amber' }, risk: { label: 'En riesgo', tone: 'red' },
};
const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const date = (iso: string) => new Date(iso).toLocaleDateString('es-MX');

function cutOff(policy: ReviewPolicyInput): string {
  const [y, m, d] = policy.nextDueOn.split('-').map(Number) as [number, number, number];
  return policy.cadence === 'monthly' ? `día ${d} de cada mes (o el último, si el mes es más corto)` : `los ${WEEKDAY[new Date(y, m - 1, d).getDay()]}`;
}

function PolicyCard({ projectId, schedule, onSaved }: { projectId: string; schedule: ReviewSchedule; onSaved: (s: ReviewSchedule) => void }) {
  const { policy } = schedule;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ReviewPolicyInput>(policy ?? {
    cadence: 'weekly', nextDueOn: '', forecastCycles: 2, evidenceRequired: true, leadValidationRequired: true, autoTasks: true,
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(undefined);
    try {
      onSaved(await api.saveReviewPolicy(projectId, form, policy?.revision ?? 0));
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.code === 'revision_conflict'
        ? 'Otra persona cambió la configuración. Recarga la página para ver la versión vigente.' : errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!policy && !editing) {
    return (
      <Empty title="Sin ciclo de revisión configurado">
        Este proyecto no tiene revisiones programadas, así que su gobernanza no se puede evaluar.
        {schedule.canConfigure && <div className="mt-3"><Button variant="primary" onClick={() => setEditing(true)}>Configurar ciclo</Button></div>}
      </Empty>
    );
  }
  if (policy && !editing) {
    return (
      <Card title="Ciclo de revisión" actions={schedule.canConfigure && <Button size="sm" onClick={() => { setForm(policy); setEditing(true); }}>Cambiar</Button>}>
        <Facts items={[
          ['Cadencia', CADENCE[policy.cadence]], ['Próxima revisión', policy.nextDueOn], ['Día de corte', cutOff(policy)],
          ['Soporte obligatorio', policy.evidenceRequired ? 'Sí' : 'No'], ['Validación del líder', policy.leadValidationRequired ? 'Sí' : 'No'],
          ['Acciones automáticas', policy.autoTasks ? 'Sí' : 'No'], ['Horizonte', `${policy.forecastCycles} ciclo(s)`],
        ]} />
      </Card>
    );
  }
  const toggle = (key: 'evidenceRequired' | 'leadValidationRequired' | 'autoTasks', label: string) => (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <Card title="Configurar ciclo de revisión">
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {error && <div className="sm:col-span-3"><Notice tone="red">{error}</Notice></div>}
        <Field label="Cadencia" htmlFor="rp-cadence">
          <Select id="rp-cadence" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })}>
            {(Object.keys(CADENCE) as Cadence[]).map((c) => <option key={c} value={c}>{CADENCE[c]}</option>)}
          </Select>
        </Field>
        <Field label="Próxima revisión" htmlFor="rp-next" hint="Su día de la semana (o del mes) será el día de corte. Si cae en fin de semana o festivo, vence el siguiente día hábil.">
          <Input id="rp-next" type="date" required value={form.nextDueOn} onChange={(e) => setForm({ ...form, nextDueOn: e.target.value })} />
        </Field>
        <Field label="Horizonte (ciclos)" htmlFor="rp-horizon" hint="Hasta dónde se anticipan renovaciones.">
          <Input id="rp-horizon" type="number" min={1} max={12} required value={form.forecastCycles}
            onChange={(e) => setForm({ ...form, forecastCycles: Number(e.target.value) })} />
        </Field>
        <div className="space-y-2 sm:col-span-3">
          {toggle('evidenceRequired', 'Exigir texto de soporte en cada revisión con cambios')}
          {toggle('leadValidationRequired', 'El líder valida cada revisión')}
          {toggle('autoTasks', 'Crear acciones automáticas al abrirse una alerta')}
        </div>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" variant="primary" disabled={busy}>Guardar</Button>
          <Button type="button" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

const TAB_OF: Record<Expectation['kind'], string> = {
  alert: 'alerts', task: 'alerts', milestone: 'milestones', risk: 'risks', renewal: 'card', change: 'changes',
};

function Expectations({ items, onAttend }: { items: Expectation[]; onAttend?: (tab: string) => void }) {
  if (items.length === 0) return <p className="text-sm text-muted">No hay compromisos que venzan en este ciclo ni asuntos por decidir.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {items.map((e) => (
        <li key={`${e.kind}-${e.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
          <span className="min-w-0 text-ink"><span className="text-muted">{KIND[e.kind]}:</span> {e.title}{e.dueOn && <span className="text-muted"> · {e.dueOn}</span>}</span>
          <span className="flex flex-wrap items-center gap-2">
            {e.blocking && <Badge tone="red">Sin causa y plan</Badge>}
            {e.overdue && <Badge tone="red">Vencido</Badge>}
            {e.critical && !e.blocking && <Badge tone="amber">Crítico</Badge>}
            {onAttend && <Button size="sm" onClick={() => onAttend(TAB_OF[e.kind])}>Atender</Button>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;
const CONFIDENCE: Record<ConfidenceLevel, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };

// Follows the prototype: it first shows what was expected, asks only for what changed, and each topic
// opens the place where that data is kept, so nothing is typed twice.
function ReviewForm({ cycle, context, onDone }: { cycle: ReviewCycle; context: ReviewContext; onDone: () => void }) {
  const { project, people, onChanged } = context;
  const [form, setForm] = useState<DraftPayload>(() => ({
    nothingChanged: false, topics: [], notes: {}, clientClimate: cycle.lastClimate, supportText: '', activeSeconds: 0, declaredConfidence: null, finance: null,
    ...cycle.draft?.payload,
  }));
  const [file, setFile] = useState<File | null>(null);
  const [suggested, setSuggested] = useState<ConfidenceLevel>();
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'failed'>(cycle.draft ? 'saved' : 'idle');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const revision = useRef(cycle.draft?.revision ?? 0);
  const seconds = useRef(cycle.draft?.payload.activeSeconds ?? 0);
  const dirty = useRef(false);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const blocking = cycle.expectations.filter((e) => e.blocking);
  const has = (topic: ReviewTopic) => form.topics.includes(topic);

  // Time actually spent on the form: it only counts while the page is visible.
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') seconds.current += 1; }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    api.assessment(project.id).then((a) => setSuggested(a.confidence.level)).catch(() => undefined);
  }, [project.id, project.revision]);
  // Known figures are shown so the PM only corrects what changed.
  useEffect(() => {
    if (!has('finance') || form.finance || !project.capabilities.seeFinancials) return;
    api.finance(project.id).then((f) => {
      if (f.current) setForm((v) => (v.finance ? v : { ...v, finance: { totalCost: f.current!.totalCost, totalEffortHours: f.current!.totalEffortHours } }));
    }).catch(() => undefined);
  }, [form.topics.join()]);

  const store = (payload: DraftPayload) => {
    saving.current = saving.current.then(async () => {
      setSaved('saving');
      try {
        const next = await api.saveReviewDraft(cycle.id, { ...payload, activeSeconds: seconds.current }, revision.current);
        revision.current = next.draft?.revision ?? revision.current;
        setSaved('saved');
      } catch (failure) {
        // A conflict means another tab saved first: take its revision so the next save lands on top.
        if (failure instanceof ApiError && failure.code === 'revision_conflict' && failure.currentRevision !== undefined) revision.current = failure.currentRevision;
        setSaved('failed');
      }
    });
    return saving.current;
  };
  useEffect(() => {
    if (!dirty.current) return undefined;
    const timer = window.setTimeout(() => { void store(form); }, 1200);
    return () => window.clearTimeout(timer);
  }, [form]);

  const change = (next: DraftPayload) => { dirty.current = true; setForm(next); };
  const toggleTopic = (topic: ReviewTopic) => change({
    ...form, nothingChanged: false, topics: has(topic) ? form.topics.filter((t) => t !== topic) : [...form.topics, topic],
  });

  async function submit() {
    if (!form.nothingChanged && form.topics.length === 0) { setError('Indica qué cambió o marca "Nada cambió".'); return; }
    if (has('client') && !form.clientClimate) { setError('Indica el clima del cliente.'); return; }
    const cost = form.finance?.totalCost.trim() ?? '';
    const effort = form.finance?.totalEffortHours?.trim() ?? '';
    if (has('finance') && cost && (!AMOUNT.test(cost) || (effort && !AMOUNT.test(effort)))) { setError('Costo y esfuerzo deben ser números positivos con hasta dos decimales.'); return; }
    if (!form.nothingChanged && cycle.policy.evidenceRequired && !form.supportText.trim()) { setError('El ciclo exige soporte: escribe el comentario que respalda la revisión.'); return; }
    setBusy(true); setError(undefined);
    try {
      await saving.current;
      const sent = await api.submitReview(cycle.id, {
        ...form, notes: {}, topics: form.nothingChanged ? [] : form.topics, clientClimate: has('client') ? form.clientClimate : null,
        supportText: form.nothingChanged ? '' : form.supportText, activeSeconds: seconds.current,
        finance: has('finance') && cost ? { totalCost: cost, totalEffortHours: effort || null } : null,
      }, cycle.projectRevision, key);
      setKey(crypto.randomUUID());
      if (file && sent.reviews[0]) {
        try {
          await api.addEvidence(project.id, 'review', sent.reviews[0].id, '', file);
        } catch (failure) {
          window.alert(`La revisión se envió, pero el archivo no se pudo adjuntar (${errorMessage(failure)}). Adjúntalo desde la revisión enviada.`);
        }
      }
      onChanged();
      onDone();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'revision_conflict') {
        setError('Los datos del proyecto cambiaron mientras preparabas la revisión. Tu captura se conserva: se actualizó lo esperado; revísalo y vuelve a enviar.');
        setKey(crypto.randomUUID());
        await store(form);
        onDone();
      } else {
        setError(errorMessage(failure));
      }
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:bg-subtle'} disabled:opacity-50`;
  const panel = (title: string, hint: string, body: ReactNode) => (
    <div className="rounded-control border border-line p-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mb-3 text-xs text-muted">{hint}</p>
      {body}
    </div>
  );
  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div>
        <p className="text-sm font-medium text-ink">{cycle.status === 'returned' ? 'Corregir y reenviar: ¿qué cambió?' : '¿Qué cambió desde la última revisión?'}</p>
        <p className="text-xs text-muted">Selecciona solo lo que cambió. El formulario se adapta a tu respuesta.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOPICS.map(([topic, label]) => (
            <button key={topic} type="button" aria-pressed={has(topic)} className={chip(has(topic))} onClick={() => toggleTopic(topic)}>{label}</button>
          ))}
          <button type="button" aria-pressed={form.nothingChanged} disabled={blocking.length > 0} className={chip(form.nothingChanged)}
            onClick={() => change({ ...form, nothingChanged: !form.nothingChanged, topics: [] })}>Nada cambió</button>
        </div>
        {blocking.length > 0 && (
          <p className="mt-2 text-xs text-bad">
            "Nada cambió" no está disponible: {blocking.length === 1 ? 'hay una alerta crítica' : `hay ${blocking.length} alertas críticas`} sin causa y plan
            ({blocking.map((b) => b.title).join('; ')}). Usa "Atender" para registrarlos.
          </p>
        )}
      </div>
      {has('client') && panel('Clima del cliente', 'Alimenta la dimensión Cliente y el tope por situación crítica.', (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CLIMATE) as Climate[]).map((c) => (
            <button key={c} type="button" aria-pressed={form.clientClimate === c} className={chip(form.clientClimate === c)}
              onClick={() => change({ ...form, clientClimate: c })}>{CLIMATE[c]}</button>
          ))}
        </div>
      ))}
      {has('finance') && panel('Actualización financiera', 'Costo real acumulado y esfuerzo consumido a la fecha de la revisión. Se registran en Economía al enviar.',
        project.capabilities.seeFinancials ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`Costo real acumulado (${project.currency})`} htmlFor={`cost-${cycle.id}`}>
              <Input id={`cost-${cycle.id}`} inputMode="decimal" value={form.finance?.totalCost ?? ''}
                onChange={(e) => change({ ...form, finance: { totalCost: e.target.value, totalEffortHours: form.finance?.totalEffortHours ?? null } })} />
            </Field>
            <Field label="Esfuerzo consumido (h)" htmlFor={`effort-${cycle.id}`}>
              <Input id={`effort-${cycle.id}`} inputMode="decimal" value={form.finance?.totalEffortHours ?? ''}
                onChange={(e) => change({ ...form, finance: { totalCost: form.finance?.totalCost ?? '', totalEffortHours: e.target.value || null } })} />
            </Field>
          </div>
        ) : <p className="text-sm text-muted">No tienes acceso a los datos económicos de este proyecto.</p>)}
      {has('scope') && panel('Cambio de alcance', 'Un cambio de alcance se registra como cambio para poder actualizar la línea base. Si no se aprueba, permanece como desviación.',
        <Changes project={project} onChanged={onChanged} />)}
      {has('risks') && panel('Actualización de riesgos', 'Nueva probabilidad, nueva fecha, mitigado, materializado o un riesgo nuevo.',
        <Risks project={project} people={people} onChanged={onChanged} />)}
      {(has('milestones') || has('schedule')) && panel('Actualización de hitos', 'Confirma cumplimiento, registra avance o agrega un hito. Mover una fecha comprometida va por un cambio.',
        <Milestones project={project} people={people} onChanged={onChanged} />)}
      {has('team') && panel('Cambios en el equipo', 'Altas, bajas o cambios de asignación que afecten la continuidad.',
        <Team project={project} people={people} onChanged={onChanged} />)}
      {panel('Nivel de confianza declarado', suggested ? `Sugerido por el sistema: ${CONFIDENCE[suggested]}, según actualidad, consistencia y soporte disponible.` : 'Qué tan confiable consideras la información de esta revisión.', (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONFIDENCE) as ConfidenceLevel[]).map((c) => (
            <button key={c} type="button" aria-pressed={(form.declaredConfidence ?? suggested) === c} className={chip((form.declaredConfidence ?? suggested) === c)}
              onClick={() => change({ ...form, declaredConfidence: c })}>{CONFIDENCE[c]}</button>
          ))}
        </div>
      ))}
      {!form.nothingChanged && panel(cycle.policy.evidenceRequired ? 'Soporte de la revisión (obligatorio)' : 'Soporte de la revisión', 'Comentario y, si quieres, un archivo: captura de correo, minuta, acta o tablero (imagen, PDF u Office, hasta 10 MB).', (
        <div className="space-y-3">
          <Textarea aria-label="Comentario de soporte" rows={3} maxLength={8000} placeholder="Qué ocurrió, decisiones tomadas, contexto relevante…" value={form.supportText}
            onChange={(e) => change({ ...form, supportText: e.target.value })} />
          <input type="file" aria-label="Archivo de soporte" className="block text-sm text-ink-soft" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <p className="text-xs text-muted">Se adjuntará al enviar: {file.name}. El archivo no se guarda en el borrador.</p>}
        </div>
      ))}
      {error && <Notice tone="red">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>Confirmar revisión</Button>
        <span className="text-xs text-muted" role="status">
          {saved === 'saving' && 'Guardando borrador…'}
          {saved === 'saved' && 'Borrador guardado'}
          {saved === 'failed' && 'No se pudo guardar el borrador; tu captura sigue aquí y se reintentará al siguiente cambio.'}
        </span>
      </div>
    </div>
  );
}

function ReviewSummary({ review, cycle, context, onDone }: { review: Review; cycle: ReviewCycle; context?: ReviewContext; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const latest = cycle.reviews[0]?.id === review.id;

  async function decide(decision: 'validated' | 'returned') {
    if (!comment.trim()) { setError('Escribe un comentario para registrar la decisión.'); return; }
    setBusy(true); setError(undefined);
    try {
      await api.validateReview(review.id, decision, comment.trim());
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.code === 'stale_review') onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-control bg-subtle p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Versión {review.revisionNo} · {review.author.displayName} · {date(review.submittedAt)}{review.late && ' · enviada tarde'}
          {review.durationSeconds !== null && ` · ${Math.max(1, Math.round(review.durationSeconds / 60))} min de captura`}
        </p>
        {review.assessment?.band && <Badge tone={BAND[review.assessment.band]?.tone}>{review.assessment.score} · {BAND[review.assessment.band]?.label}</Badge>}
      </div>
      {review.nothingChanged ? <p className="mt-2 text-ink">Nada cambió desde la revisión anterior.</p>
        : <p className="mt-2 text-ink"><strong>Qué cambió:</strong> {review.topics.map((t) => TOPIC[t]).join(', ')}</p>}
      {review.finance && (
        <p className="mt-1 text-ink"><strong>Finanzas:</strong> costo acumulado {review.finance.totalCost}{review.finance.totalEffortHours && ` · esfuerzo ${review.finance.totalEffortHours} h`}</p>
      )}
      {review.declaredConfidence && <p className="mt-1 text-ink"><strong>Confianza declarada:</strong> {CONFIDENCE[review.declaredConfidence]}</p>}
      {review.clientClimate && <p className="mt-1 text-ink"><strong>Clima del cliente:</strong> {CLIMATE[review.clientClimate]}</p>}
      {review.supportText && <p className="mt-1 text-ink"><strong>Soporte:</strong> {review.supportText}</p>}
      {review.validation && (
        <p className="mt-2 text-ink">
          <strong>{review.validation.decision === 'validated' ? 'Validada' : 'Devuelta'} por {review.validation.validator.displayName}:</strong> {review.validation.comment}
        </p>
      )}
      <div className="mt-2">
        <EvidencePanel projectId={cycle.projectId} kind="review" targetId={review.id}
          canAdd={Boolean(context?.project.capabilities.editOperation)} canWithdraw={Boolean(context?.project.capabilities.decide)} />
      </div>
      {error && <div className="mt-2"><Notice tone="red">{error}</Notice></div>}
      {latest && cycle.canValidate && (
        <div className="mt-3 space-y-2">
          <Input aria-label={`Comentario de validación del ciclo del ${cycle.dueOn}`} placeholder="Comentario de la validación (obligatorio)" value={comment}
            onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => decide('validated')}>Validar revisión</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => decide('returned')}>Devolver con observación</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CycleCard({ cycle, showProject, context, onDone }: { cycle: ReviewCycle; showProject?: boolean; context?: ReviewContext; onDone: () => void }) {
  const pending = ['open', 'overdue', 'returned'].includes(cycle.status);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{showProject && `${cycle.projectName} · `}Ciclo del {cycle.startsOn} al {cycle.dueOn}</p>
          <p className="text-xs text-muted">{CADENCE[cycle.policy.cadence]} · vence el {cycle.dueOn}</p>
        </div>
        <Badge tone={STATUS[cycle.status].tone}>{STATUS[cycle.status].label}</Badge>
      </div>
      {pending && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-ink-soft">Qué se espera en esta revisión</p>
          <Expectations items={cycle.expectations} onAttend={context?.onNavigate} />
        </div>
      )}
      {cycle.reviews.length > 0 && (
        <div className="mt-4 space-y-2">{cycle.reviews.map((r) => <ReviewSummary key={r.id} review={r} cycle={cycle} context={context} onDone={onDone} />)}</div>
      )}
      {cycle.canSubmit && context && <ReviewForm key={`${cycle.id}-${cycle.reviews.length}`} cycle={cycle} context={context} onDone={onDone} />}
    </Card>
  );
}

export function ReviewsTab(context: ReviewContext) {
  const { project } = context;
  const [schedule, setSchedule] = useState<ReviewSchedule>();
  const [error, setError] = useState<string>();
  const load = () => api.reviewSchedule(project.id).then(setSchedule).catch((f) => setError(errorMessage(f)));
  useEffect(() => { void load(); }, [project.id, project.revision]);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!schedule) return <Loading />;
  // Oldest first among what still needs the PM, so a returned review comes before the next cycle.
  const pending = schedule.cycles.filter((c) => ['open', 'overdue', 'returned'].includes(c.status)).reverse();
  const done = schedule.cycles.filter((c) => !pending.includes(c));
  return (
    <div className="space-y-4">
      <PolicyCard projectId={project.id} schedule={schedule} onSaved={setSchedule} />
      {pending.map((c) => <CycleCard key={c.id} cycle={c} context={context} onDone={() => void load()} />)}
      {done.length > 0 && <h3 className="pt-2 text-sm font-medium text-ink-soft">Revisiones enviadas</h3>}
      {done.map((c) => <CycleCard key={c.id} cycle={c} context={context} onDone={() => void load()} />)}
    </div>
  );
}

// The lead's inbox: submissions waiting for a decision, in every project where this user decides.
export function PendingReviews() {
  const [cycles, setCycles] = useState<ReviewCycle[]>();
  const load = () => api.pendingReviews().then(setCycles).catch(() => setCycles([]));
  useEffect(() => { void load(); }, []);
  if (!cycles || cycles.length === 0) return null;
  return (
    <div className="mb-6 space-y-4">
      <h2 className="text-sm font-medium text-ink-soft">Revisiones por validar</h2>
      {cycles.map((c) => <CycleCard key={c.id} cycle={c} showProject onDone={() => void load()} />)}
    </div>
  );
}
