import { useEffect, useState } from 'react';
import {
  api, errorMessage, type HistoryEntry, type InactiveProject, type ProjectDetail, type RuleSet, type Timeline, type TimelineItem,
} from './api';
import type { OpenProject } from './Home';
import catalog from './phf-catalog.json';
import { Badge, Button, Card, Empty, Input, Loading, Notice, PageHeader, Select, type Tone } from './ui';

const CATEGORY: Record<string, string> = {
  project: 'Proyecto y línea base', milestone: 'Hitos', risk: 'Riesgos', change: 'Cambios', review: 'Revisiones', alert: 'Alertas', action: 'Acciones',
  evaluation: 'Evaluaciones', finance: 'Economía', renewal: 'Renovaciones', evidence: 'Evidencias',
};
const CADENCE: Record<string, string> = { weekly: 'semanal', fortnightly: 'quincenal', monthly: 'mensual' };

function TimelineList({ items, tone, empty, onNavigate }: { items: TimelineItem[]; tone?: Tone; empty: string; onNavigate: (tab: string) => void }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item, index) => (
        <li key={`${item.kind}-${item.title}-${item.date}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="min-w-0 text-left text-ink hover:underline" onClick={() => onNavigate(item.tab)}>{item.title}</button>
          <span className="flex items-center gap-2">
            {item.critical && tone && <Badge tone={tone}>Crítico</Badge>}
            <span className="text-xs text-muted">{item.date}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Timeline and full history of a project (PHS-038).
export function HistoryTab({ project, onNavigate }: { project: ProjectDetail; onNavigate: (tab: string) => void }) {
  const [timeline, setTimeline] = useState<Timeline>();
  const [entries, setEntries] = useState<HistoryEntry[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ category: '', from: '', to: '' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.timeline(project.id).then(setTimeline).catch((f) => setError(errorMessage(f))); }, [project.id, project.revision]);
  useEffect(() => {
    let current = true;
    setEntries(undefined);
    api.history(project.id, filters)
      .then((page) => { if (current) { setEntries(page.items); setCursor(page.nextCursor); } })
      .catch((f) => { if (current) setError(errorMessage(f)); });
    return () => { current = false; };
  }, [project.id, project.revision, filters.category, filters.from, filters.to]);

  async function more() {
    if (!cursor) return;
    setBusy(true);
    try {
      const page = await api.history(project.id, { ...filters, cursor });
      setEntries((all) => [...(all ?? []), ...page.items]); setCursor(page.nextCursor);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      {timeline && (
        <Card title="Línea de tiempo">
          <div className="grid gap-6 lg:grid-cols-3">
            <section>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Pasado · últimos 60 días</h4>
              <TimelineList items={timeline.past} empty="Sin hechos recientes." onNavigate={onNavigate} />
            </section>
            <section>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-bad">Hoy, {timeline.today} · vencido</h4>
              <TimelineList items={timeline.overdue} tone="red" empty="Nada vencido." onNavigate={onNavigate} />
            </section>
            <section>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Futuro · hasta el {timeline.horizon.until}</h4>
              <TimelineList items={timeline.upcoming} tone="amber" empty="Nada vence en el horizonte." onNavigate={onNavigate} />
            </section>
          </div>
          <p className="mt-4 text-xs text-muted">
            El horizonte son {timeline.horizon.cycles} ciclo(s) de revisión con cadencia {CADENCE[timeline.horizon.cadence]}
            {timeline.horizon.assumed && '; es el valor por defecto porque el proyecto no tiene ciclo configurado'}.
          </p>
        </Card>
      )}
      <Card title="Historial">
        <div className="mb-4 flex flex-wrap gap-3">
          <Select aria-label="Tipo" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="sm:w-56">
            <option value="">Todo</option>
            {Object.entries(CATEGORY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <Input aria-label="Desde" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="sm:w-44" />
          <Input aria-label="Hasta" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="sm:w-44" />
        </div>
        {!entries && !error && <Loading />}
        {entries?.length === 0 && <p className="text-sm text-muted">No hay registros con esos filtros.</p>}
        {entries && entries.length > 0 && (
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{entry.title}</span>
                  <span className="text-xs text-muted">{new Date(entry.occurredAt).toLocaleString('es-MX')} · {entry.actor ?? 'Sistema'}</span>
                </div>
                {entry.detail && <p className="mt-1 text-sm text-ink-soft">{entry.detail}</p>}
                <p className="mt-1 text-xs text-muted">{CATEGORY[entry.category] ?? entry.category}</p>
              </li>
            ))}
          </ul>
        )}
        {cursor && <div className="mt-4"><Button onClick={() => void more()} disabled={busy}>{busy ? 'Cargando…' : 'Cargar más'}</Button></div>}
      </Card>
    </div>
  );
}

const AGE: [string, string, number][] = [['', 'Cualquier antigüedad', 0], ['30', 'Más de 30 días', 30], ['90', 'Más de 90 días', 90], ['180', 'Más de 180 días', 180]];

// Paused and closed projects with their reason (PHS-046).
export function InactiveProjects({ onOpen }: { onOpen: OpenProject }) {
  const [rows, setRows] = useState<InactiveProject[]>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState('');
  const [practice, setPractice] = useState('');
  const [age, setAge] = useState('');
  useEffect(() => { api.inactiveProjects().then(setRows).catch((f) => setError(errorMessage(f))); }, []);

  const practices = [...new Map((rows ?? []).map((r) => [r.practiceId, r.practiceName])).entries()];
  const shown = (rows ?? []).filter((r) => (!status || r.status === status) && (!practice || r.practiceId === practice) && (!age || (r.days ?? 0) > Number(age)));
  const stopped = (r: InactiveProject) => [
    r.stopped.openMilestones && `${r.stopped.openMilestones} hito(s) abierto(s)`, r.stopped.openRisks && `${r.stopped.openRisks} riesgo(s) abierto(s)`,
    r.stopped.openActions && `${r.stopped.openActions} acción(es) abierta(s)`, r.stopped.pendingRenewals && `${r.stopped.pendingRenewals} renovación(es) pendiente(s)`,
    r.stopped.reviewCycle && 'revisiones sin programar',
  ].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader title="Pausados y cerrados" subtitle="Proyectos detenidos a tu alcance, con su motivo y lo que quedó pendiente. Primero los que deben una justificación." />
      {error && <Notice tone="red">{error}</Notice>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Empty title="No hay proyectos pausados ni cerrados a tu alcance" />}
      {rows && rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48">
              <option value="">Pausados y cerrados</option><option value="paused">Solo pausados</option><option value="closed">Solo cerrados</option>
            </Select>
            {practices.length > 1 && (
              <Select aria-label="Práctica" value={practice} onChange={(e) => setPractice(e.target.value)} className="sm:w-56">
                <option value="">Todas las prácticas</option>
                {practices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            )}
            <Select aria-label="Antigüedad" value={age} onChange={(e) => setAge(e.target.value)} className="sm:w-52">
              {AGE.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </div>
          {shown.length === 0 && <p className="text-sm text-muted">Ningún proyecto coincide con los filtros.</p>}
          {shown.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-xs text-muted">{r.code} · {r.clientName} · {r.practiceName} · PM {r.pmName}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.justificationRequired && <Badge tone="red">Debe justificación</Badge>}
                  <Badge tone={r.status === 'paused' ? 'amber' : 'neutral'}>{r.status === 'paused' ? 'Pausado' : 'Cerrado'}{r.days !== null && ` hace ${r.days} día(s)`}</Badge>
                  <Button size="sm" onClick={() => onOpen(r.id, 'card')}>Abrir</Button>
                </div>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div><dt className="inline font-medium text-ink">Motivo: </dt>
                  <dd className="inline text-ink">{r.reason ?? 'Sin registro'}{r.since && <span className="text-muted"> · {new Date(r.since).toLocaleDateString('es-MX')}{r.changedBy && `, ${r.changedBy}`}</span>}</dd></div>
                <div><dt className="inline font-medium text-ink">Última justificación: </dt>
                  <dd className="inline text-ink">{r.lastJustification
                    ? <>{r.lastJustification.text}<span className="text-muted"> · {new Date(r.lastJustification.at).toLocaleDateString('es-MX')}, {r.lastJustification.by}</span></>
                    : r.justificationRequired ? 'Pendiente: lleva 30 días o más sin describir la situación.' : 'Aún no se requiere.'}</dd></div>
                <div><dt className="inline font-medium text-ink">Quedó detenido: </dt><dd className="inline text-ink">{stopped(r) || 'Nada abierto.'}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

interface CatalogEntry { title: string; category: string; what: string; objective: string; value: string; relevant: string; mvp: string }
const ENTRIES = Object.entries(catalog.catalog as Record<string, CatalogEntry>);
const GROUPS = [...new Set(ENTRIES.map(([, entry]) => entry.category))];
// Where each stage of the flow lives in this application.
const STAGE_PLACE: Record<string, string> = {
  core: 'Proyectos → ficha del proyecto', baseline: 'Proyecto → Línea base', exec: 'Proyecto → Hitos, Riesgos y Cambios', timeline: 'Proyecto → Historial',
  expect: 'Proyecto → Revisión, "Qué se espera"', review: 'Proyecto → Revisión', events: 'Proyecto → Alertas y acciones', assess: 'Proyecto → Salud',
  tasks: 'Mis acciones y Proyecto → Alertas y acciones', center: 'Inicio', history: 'Proyecto → Historial',
};
// What this version does differently from, or does not yet do of, what the catalog describes.
const VERSION_NOTE: Record<string, string> = {
  portfolio: 'Aún no construido: el portafolio comparativo es la historia PHS-037.',
  directionView: 'Dirección usa por ahora la pantalla Inicio; el portafolio comparativo aún no está construido.',
  reviewConfidence: 'La confianza declarada se guarda con la revisión; la que muestra el sistema es la calculada.',
  support: 'El soporte obligatorio se cumple con el comentario; el archivo es adicional.',
  oneMinute: 'El tiempo de captura se registra con cada revisión, pero aún no se reporta como indicador.',
};
const DIMENSION: Record<string, string> = { performance: 'Desempeño', financial: 'Financiero', risks: 'Riesgos', client: 'Cliente', governance: 'Gobernanza', team: 'Equipo' };
const GATE: Record<string, string> = {
  project_deviation: 'Desviación de proyecto', financial_deviation: 'Desviación financiera', critical_milestone_overdue: 'Hito crítico vencido',
  critical_risk: 'Riesgo crítico vencido o materializado', review_overdue: 'Revisión vencida', client_critical: 'Cliente en situación crítica',
};

// Help: the PHF model as the prototype defines it, with the values the engine really applies (PHS-039).
export function PhfModel() {
  const [rules, setRules] = useState<RuleSet>();
  const [error, setError] = useState<string>();
  const [group, setGroup] = useState(GROUPS[0] ?? '');
  useEffect(() => { api.rules().then(setRules).catch((f) => setError(errorMessage(f))); }, []);
  const rows = (items: [string, string | number][]) => (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-line py-1"><dt className="text-ink-soft">{label}</dt><dd className="font-medium text-ink">{value}</dd></div>)}
    </dl>
  );
  return (
    <>
      <PageHeader title="Modelo PHF" subtitle="Cómo se representa, revisa, mide y gobierna la salud de un proyecto, y con qué valores se calcula hoy." />
      <div className="space-y-4">
        <Card title="El flujo, en once etapas">
          <ol className="space-y-3">
            {catalog.flow.map((stage) => (
              <li key={stage.n} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong" aria-hidden>{stage.n}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{stage.stage}: {stage.title} <span className="font-normal text-muted">— {stage.lead}</span></p>
                  <p className="text-sm text-ink-soft">{stage.detail}</p>
                  <p className="text-xs text-muted">En la aplicación: {STAGE_PLACE[stage.key]}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Reglas vigentes" actions={rules && <Badge tone="blue">{rules.version}</Badge>}>
          {error && <Notice tone="red">{error}</Notice>}
          {!rules && !error && <Loading />}
          {rules && (
            <div className="space-y-5">
              <p className="text-sm text-ink-soft">Estos son los valores que aplica el motor en este momento. Son la versión 1, aprobada por el dueño del producto; los de confianza, tendencia y proyección se tomaron del prototipo como punto de partida.</p>
              <section><h4 className="mb-2 text-sm font-medium text-ink">Peso de cada dimensión</h4>
                {rows(Object.entries(rules.dimensionWeights).map(([key, weight]) => [DIMENSION[key] ?? key, `${weight}%`]))}</section>
              <section><h4 className="mb-2 text-sm font-medium text-ink">Reglas críticas: el score no puede pasar de</h4>
                {rows(Object.entries(rules.gateCaps).map(([key, cap]) => [
                  `${GATE[key] ?? key}${key === 'project_deviation' ? ` mayor a ${rules.gateThresholds.projectDeviation} puntos` : key === 'financial_deviation' ? ` mayor a ${rules.gateThresholds.financialDeviation}%` : ''}`, cap]))}</section>
              <section><h4 className="mb-2 text-sm font-medium text-ink">Semáforo y tendencia</h4>
                {rows([['Saludable desde', rules.bands.healthy], ['En atención desde', rules.bands.attention], ['En riesgo', `menos de ${rules.bands.attention}`],
                  ['Mejora entre ciclos', `+${rules.trend.improving} puntos o más`], ['Deterioro entre ciclos', `${rules.trend.deteriorating} puntos o menos`]])}</section>
              <section><h4 className="mb-2 text-sm font-medium text-ink">Proyección: presión que suma cada factor</h4>
                {rows([['Hito por vencer', rules.forecast.milestone], ['Adicional si el hito es crítico', rules.forecast.criticalMilestone],
                  ['Mitigación por vencer, por punto de severidad', rules.forecast.riskPerSeverityPoint], ['Acción por vencer', rules.forecast.task],
                  ['Renovación próxima', rules.forecast.renewal], ['Por punto de caída de la tendencia', rules.forecast.perPointOfDecline],
                  ['Cada desviación activa', rules.forecast.activeDeviationGate], ['Riesgo de deterioro desde', rules.forecast.levels.atRisk],
                  ['Deterioro esperado desde', rules.forecast.levels.deteriorating]])}</section>
              <p className="text-xs text-muted">La confianza parte de 100 y resta por revisiones atrasadas, dimensiones sin dato, revisiones sin soporte, alertas críticas sin causa y plan, y falta de línea base; el detalle de cada proyecto está en su pestaña Salud.</p>
            </div>
          )}
        </Card>

        <Card title="Definiciones">
          <div className="mb-4">
            <Select aria-label="Grupo" value={group} onChange={(e) => setGroup(e.target.value)} className="sm:w-72">
              {GROUPS.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </div>
          <div className="divide-y divide-line">
            {ENTRIES.filter(([, entry]) => entry.category === group).map(([key, entry]) => (
              <details key={key} className="py-3 first:pt-0 last:pb-0">
                <summary className="cursor-pointer text-sm font-medium text-ink">{entry.title}</summary>
                <dl className="mt-2 space-y-1 text-sm text-ink-soft">
                  <div><dt className="inline font-medium text-ink">Qué es: </dt><dd className="inline">{entry.what}</dd></div>
                  <div><dt className="inline font-medium text-ink">Propósito: </dt><dd className="inline">{entry.objective}</dd></div>
                  <div><dt className="inline font-medium text-ink">Valor: </dt><dd className="inline">{entry.value}</dd></div>
                  <div><dt className="inline font-medium text-ink">Cómo aplica: </dt><dd className="inline">{entry.relevant}</dd></div>
                  {VERSION_NOTE[key] && <div><dt className="inline font-medium text-warn">En esta versión: </dt><dd className="inline">{VERSION_NOTE[key]}</dd></div>}
                </dl>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
