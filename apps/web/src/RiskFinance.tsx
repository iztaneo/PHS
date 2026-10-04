import { type FormEvent, useEffect, useState } from 'react';
import {
  api, errorMessage, type FinanceSummary, type PracticePerson, type ProjectDetail, type Risk, type RiskHistoryEntry,
  type RiskInput, type RiskStatus,
} from './api';
import { Badge, Button, Card, Empty, Facts, Field, Input, Loading, Notice, Select, Textarea, type Tone } from './ui';

interface SectionProps {
  project: ProjectDetail;
  people: PracticePerson[];
  onChanged: () => void;
}

const CATEGORY: Record<string, string> = {
  schedule: 'Cronograma', financial: 'Financiero', client: 'Cliente', team: 'Equipo', technical: 'Técnico',
  supplier: 'Proveedor', scope: 'Alcance',
};
const LEVEL = ['', 'Baja', 'Media', 'Alta'];
const STATUS: Record<RiskStatus, { label: string; tone: Tone }> = {
  open: { label: 'Abierto', tone: 'amber' },
  mitigating: { label: 'En mitigación', tone: 'blue' },
  mitigated: { label: 'Mitigado', tone: 'green' },
  materialized: { label: 'Materializado', tone: 'red' },
  closed: { label: 'Cerrado', tone: 'neutral' },
};
const NEXT: Record<RiskStatus, { to: RiskStatus; label: string }[]> = {
  open: [{ to: 'mitigating', label: 'Iniciar mitigación' }, { to: 'materialized', label: 'Materializado' }, { to: 'closed', label: 'Cerrar' }],
  mitigating: [{ to: 'mitigated', label: 'Mitigado' }, { to: 'materialized', label: 'Materializado' }, { to: 'closed', label: 'Cerrar' }],
  mitigated: [{ to: 'closed', label: 'Cerrar' }, { to: 'open', label: 'Reabrir' }],
  materialized: [{ to: 'closed', label: 'Cerrar' }],
  closed: [{ to: 'open', label: 'Reabrir' }],
};
const severityTone = (severity: number): Tone => (severity >= 6 ? 'red' : severity >= 3 ? 'amber' : 'neutral');
const EMPTY: RiskInput = { title: '', description: '', riskType: 'project', category: 'schedule', probability: 2, impact: 2, ownerId: '', mitigationDueOn: '', strategy: '' };

export function Risks({ project, people, onChanged }: SectionProps) {
  const [items, setItems] = useState<Risk[]>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState<RiskInput>(EMPTY);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, RiskHistoryEntry[] | undefined>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canEdit = project.capabilities.editOperation;

  const load = () => api.risks(project.id).then(setItems).catch((f) => setError(errorMessage(f)));
  useEffect(() => { void load(); }, [project.id]);

  async function run(work: () => Promise<void>): Promise<boolean> {
    setBusy(true); setError(undefined);
    try {
      await work(); await load(); onChanged();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run(async () => { await api.createRisk(project.id, form, key); })) { setForm(EMPTY); setKey(crypto.randomUUID()); }
  }

  async function followUp(risk: Risk, status?: RiskStatus) {
    const comment = comments[risk.id]?.trim() ?? '';
    if (!comment) { setError('Escribe un comentario para registrar el seguimiento.'); return; }
    if (await run(async () => { await api.followUpRisk(project.id, risk.id, risk.revision, comment, status ? { status } : {}); })) {
      setComments({ ...comments, [risk.id]: '' });
      if (history[risk.id]) setHistory({ ...history, [risk.id]: await api.riskHistory(project.id, risk.id) });
    }
  }

  async function toggleHistory(risk: Risk) {
    if (history[risk.id]) { setHistory({ ...history, [risk.id]: undefined }); return; }
    try {
      setHistory({ ...history, [risk.id]: await api.riskHistory(project.id, risk.id) });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      {!items && !error && <Loading />}
      {items?.length === 0 && <Empty title="Aún no hay riesgos registrados">{canEdit && 'Registra lo que podría afectar los compromisos del proyecto.'}</Empty>}
      {items?.map((risk) => (
        <Card key={risk.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{risk.title}</p>
              {risk.description && <p className="text-sm text-muted">{risk.description}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {risk.overdue && <Badge tone="red">Mitigación vencida</Badge>}
              <Badge tone={severityTone(risk.severity)}>Severidad {risk.severity}</Badge>
              <Badge tone={STATUS[risk.status].tone}>{STATUS[risk.status].label}</Badge>
            </div>
          </div>
          <div className="mt-4">
            <Facts items={[
              ['Tipo y categoría', `${risk.riskType === 'client' ? 'Del cliente' : 'Del proyecto'} · ${CATEGORY[risk.category] ?? risk.category}`],
              ['Probabilidad e impacto', `${LEVEL[risk.probability]} · ${LEVEL[risk.impact]}`],
              ['Responsable', risk.owner.displayName],
              ['Fecha de mitigación', risk.mitigationDueOn],
              ['Estrategia', risk.strategy || 'Sin definir'],
            ]} />
          </div>
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            {risk.canUpdate && (
              <>
                <Input aria-label={`Comentario de seguimiento para ${risk.title}`} placeholder="Comentario de seguimiento (obligatorio)"
                  value={comments[risk.id] ?? ''} onChange={(e) => setComments({ ...comments, [risk.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => followUp(risk)}>Registrar seguimiento</Button>
                  {NEXT[risk.status].map((action) => (
                    <Button key={action.to} size="sm" disabled={busy} variant={action.to === 'materialized' ? 'danger' : 'secondary'}
                      onClick={() => followUp(risk, action.to)}>{action.label}</Button>
                  ))}
                </div>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => toggleHistory(risk)}>{history[risk.id] ? 'Ocultar historial' : 'Ver historial'}</Button>
            {history[risk.id] && (
              <ol className="space-y-2 text-sm">
                {history[risk.id]!.map((entry) => (
                  <li key={entry.occurredAt} className="rounded-control bg-subtle px-3 py-2">
                    <span className="block text-ink">{entry.note}</span>
                    <span className="block text-xs text-muted">
                      {new Date(entry.occurredAt).toLocaleString('es-MX')} · {entry.actor?.displayName ?? 'Sistema'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      ))}
      {canEdit && (
        <Card title="Registrar riesgo">
          <form onSubmit={add} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Título" htmlFor="r-title" className="sm:col-span-2">
              <Input id="r-title" required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Tipo" htmlFor="r-type">
              <Select id="r-type" value={form.riskType} onChange={(e) => setForm({ ...form, riskType: e.target.value as RiskInput['riskType'] })}>
                <option value="project">Del proyecto</option>
                <option value="client">Del cliente</option>
              </Select>
            </Field>
            <Field label="Categoría" htmlFor="r-category">
              <Select id="r-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORY).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Probabilidad" htmlFor="r-prob">
              <Select id="r-prob" value={form.probability} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL[n]}</option>)}
              </Select>
            </Field>
            <Field label="Impacto" htmlFor="r-impact">
              <Select id="r-impact" value={form.impact} onChange={(e) => setForm({ ...form, impact: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL[n]}</option>)}
              </Select>
            </Field>
            <Field label="Responsable" htmlFor="r-owner">
              <Select id="r-owner" required value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Selecciona…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </Select>
            </Field>
            <Field label="Fecha límite de mitigación" htmlFor="r-due">
              <Input id="r-due" type="date" required value={form.mitigationDueOn} onChange={(e) => setForm({ ...form, mitigationDueOn: e.target.value })} />
            </Field>
            <Field label="Estrategia de mitigación" htmlFor="r-strategy" className="sm:col-span-2">
              <Textarea id="r-strategy" rows={2} maxLength={4000} value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} />
            </Field>
            <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={busy}>Registrar riesgo</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}

const MISSING: Record<string, string> = {
  budget: 'no hay presupuesto en la línea base',
  cost: 'no hay costo registrado a esta fecha',
  progress: 'no hay hitos comprometidos para medir el avance',
};
const money = (value: string | null, currency: string) =>
  value === null ? 'Desconocido' : `${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${currency}`;

export function Finance({ project, onChanged }: SectionProps) {
  const [summary, setSummary] = useState<FinanceSummary>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ effectiveOn: '', totalCost: '', totalEffortHours: '', source: '', supersedesId: '' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canEdit = project.capabilities.editOperation;

  const load = () => api.finance(project.id).then(setSummary).catch((f) => setError(errorMessage(f)));
  useEffect(() => { void load(); }, [project.id, project.revision]);

  async function record(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(undefined);
    try {
      await api.recordObservation(project.id, {
        effectiveOn: form.effectiveOn, totalCost: form.totalCost.trim(), totalEffortHours: form.totalEffortHours.trim() || null,
        source: form.source, supersedesId: form.supersedesId || null,
      }, key);
      setForm({ effectiveOn: '', totalCost: '', totalEffortHours: '', source: '', supersedesId: '' });
      setKey(crypto.randomUUID());
      await load(); onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!summary) return error ? <Notice tone="red">{error}</Notice> : <Loading />;
  const deviation = summary.deviation === null ? null : Number(summary.deviation);

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Presupuesto</p>
          <p className="mt-1 text-xl font-semibold text-ink">{money(summary.budget, summary.currency)}</p>
          <p className="mt-1 text-xs text-muted">De la línea base vigente</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Gasto real</p>
          <p className="mt-1 text-xl font-semibold text-ink">{summary.current ? money(summary.current.totalCost, summary.currency) : 'Sin registro'}</p>
          <p className="mt-1 text-xs text-muted">{summary.current ? `Acumulado al ${summary.current.effectiveOn}` : 'Registra la primera observación'}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Desviación financiera</p>
          {deviation === null ? (
            <>
              <p className="mt-1 text-xl font-semibold text-ink">Sin dato</p>
              <p className="mt-1 text-xs text-muted">Falta: {summary.missing.map((m) => MISSING[m]).join('; ')}.</p>
            </>
          ) : (
            <>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold text-ink">
                {deviation.toFixed(1)}%
                <Badge tone={summary.gate ? 'red' : deviation > 0 ? 'amber' : 'green'}>{summary.gate ? 'Supera 3%' : deviation > 0 ? 'Dentro del límite' : 'Sin sobrecosto'}</Badge>
              </p>
              <p className="mt-1 text-xs text-muted">
                Avance real {Number(summary.actualProgress).toFixed(1)}% justifica {money(summary.expectedCost, summary.currency)}.
              </p>
            </>
          )}
        </Card>
      </div>

      {canEdit && (
        <Card title={form.supersedesId ? 'Corregir observación' : 'Registrar observación'}>
          <form onSubmit={record} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {form.supersedesId && (
              <div className="sm:col-span-2">
                <Notice tone="blue">
                  Esta observación corrige una anterior, que se conservará en el historial.{' '}
                  <button type="button" className="font-medium underline" onClick={() => setForm({ ...form, supersedesId: '' })}>Cancelar corrección</button>
                </Notice>
              </div>
            )}
            <Field label="Fecha efectiva" htmlFor="f-date">
              <Input id="f-date" type="date" required value={form.effectiveOn} onChange={(e) => setForm({ ...form, effectiveOn: e.target.value })} />
            </Field>
            <Field label={`Costo acumulado (${summary.currency})`} htmlFor="f-cost" hint="Total gastado hasta la fecha, no el gasto del periodo.">
              <Input id="f-cost" required inputMode="decimal" pattern="\d{1,16}(\.\d{1,2})?" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} />
            </Field>
            <Field label="Horas acumuladas (opcional)" htmlFor="f-hours">
              <Input id="f-hours" inputMode="decimal" pattern="\d{1,16}(\.\d{1,2})?" value={form.totalEffortHours} onChange={(e) => setForm({ ...form, totalEffortHours: e.target.value })} />
            </Field>
            <Field label="Origen del dato" htmlFor="f-source">
              <Input id="f-source" required maxLength={200} placeholder="Reporte de costos de septiembre" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
            <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar observación'}</Button></div>
          </form>
        </Card>
      )}

      <Card title="Historial de observaciones">
        {summary.observations.length === 0 ? <p className="text-sm text-muted">Aún no hay observaciones.</p> : (
          <ul className="divide-y divide-line text-sm">
            {summary.observations.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                <span className="w-24 text-muted">{o.effectiveOn}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${o.superseded ? 'text-muted line-through' : 'text-ink'}`}>{money(o.totalCost, summary.currency)}</span>
                  <span className="block text-xs text-muted">
                    {o.source} · {o.recordedBy.displayName}{o.totalEffortHours && ` · ${o.totalEffortHours} h`}
                  </span>
                </span>
                {o.superseded && <Badge>Corregida</Badge>}
                {o.supersedesId && <Badge tone="blue">Corrección</Badge>}
                {summary.current?.id === o.id && <Badge tone="green">Vigente</Badge>}
                {canEdit && !o.superseded && (
                  <Button size="sm" variant="ghost" onClick={() => setForm({
                    effectiveOn: o.effectiveOn, totalCost: o.totalCost, totalEffortHours: o.totalEffortHours ?? '', source: o.source, supersedesId: o.id,
                  })}>Corregir</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
