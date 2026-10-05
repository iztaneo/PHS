import { useEffect, useState } from 'react';
import { api, errorMessage, type AppNotification, type CenterProject, type FocusItem, type HealthCenter, type Inbox } from './api';
import { Badge, Button, Card, Empty, Loading, Notice, PageHeader, Select, type Tone } from './ui';

export type OpenProject = (projectId: string, tab: string) => void;

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  critical: { label: 'Crítico', tone: 'red' }, warning: { label: 'Atención', tone: 'amber' }, info: { label: 'Informativo', tone: 'neutral' },
};
const BAND: Record<string, { label: string; tone: Tone }> = {
  healthy: { label: 'Saludable', tone: 'green' }, attention: { label: 'En atención', tone: 'amber' }, risk: { label: 'En riesgo', tone: 'red' },
};
const CONFIDENCE: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const REVIEW: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Por enviar', tone: 'blue' }, overdue: { label: 'Vencida', tone: 'red' }, submitted: { label: 'En validación', tone: 'amber' },
  returned: { label: 'Devuelta', tone: 'red' },
};
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
// What each focus asks for, in words.
const FOCUS: Record<string, (f: FocusItem) => string> = {
  review_overdue: (f) => `Revisión vencida el ${f.dueOn}`,
  review_due: (f) => `Revisión por enviar antes del ${f.dueOn}`,
  review_returned: () => 'Revisión devuelta por el líder: corregir y reenviar',
  review_to_validate: (f) => `${plural(f.count, 'revisión espera', 'revisiones esperan')} tu validación`,
  change_to_decide: (f) => `${plural(f.count, 'cambio espera', 'cambios esperan')} tu decisión`,
  response_to_validate: (f) => `${plural(f.count, 'causa y plan espera', 'causas y planes esperan')} tu validación`,
  alerts_untreated: (f) => `${plural(f.count, 'alerta crítica', 'alertas críticas')} sin causa y plan`,
  my_action: (f) => `Acción a tu cargo: ${f.subject}`,
  project_at_risk: (f) => `Proyecto en riesgo (score ${Number(f.subject).toFixed(0)})`,
  project_in_attention: (f) => `Proyecto en atención (score ${Number(f.subject).toFixed(0)})`,
  low_confidence: (f) => `Confianza baja en la información (${Number(f.subject).toFixed(0)} de 100)`,
  milestone_due: (f) => `Hito por vencer: ${f.subject}`,
  risk_due: (f) => `Mitigación por vencer: ${f.subject}`,
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'warn' }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${value > 0 && tone === 'bad' ? 'text-bad' : value > 0 && tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</p>
    </Card>
  );
}

// Health Center (PHS-035, PHS-036): what to attend today. The same screen serves the PM, the lead
// and Dirección; what it lists depends on the user's role in each project.
export function Home({ onOpen }: { onOpen: OpenProject }) {
  const [center, setCenter] = useState<HealthCenter>();
  const [error, setError] = useState<string>();
  const [practice, setPractice] = useState('');
  const [pm, setPm] = useState('');
  useEffect(() => { api.center().then(setCenter).catch((f) => setError(errorMessage(f))); }, []);

  if (error) return <><PageHeader title="Inicio" /><Notice tone="red">{error}</Notice></>;
  if (!center) return <><PageHeader title="Inicio" /><Loading /></>;
  const practices = [...new Map(center.projects.map((p) => [p.practiceId, p.practiceName])).entries()];
  const pms = [...new Set(center.projects.map((p) => p.pmName))].sort();
  const shown = center.projects.filter((p) => (!practice || p.practiceId === practice) && (!pm || p.pmName === pm));
  const ids = new Set(shown.map((p) => p.id));
  const focus = center.focus.filter((f) => ids.has(f.projectId));
  const sum = (pick: (p: CenterProject) => number) => shown.reduce((total, p) => total + pick(p), 0);
  const decides = shown.some((p) => p.counts.pendingDecisions > 0) || focus.some((f) => f.kind.endsWith('_to_validate') || f.kind === 'change_to_decide');

  return (
    <>
      <PageHeader title="Inicio" subtitle={`Qué atender hoy, ${center.today}, en los proyectos a tu alcance.`} />
      {center.incomplete && (
        <div className="mb-4"><Notice tone="amber" role="status">No se pudo incluir toda la información: estos conteos son parciales. Vuelve a cargar en unos minutos.</Notice></div>
      )}
      {center.projects.length === 0 ? (
        <Empty title="No tienes proyectos activos a tu alcance">Cuando seas PM o integrante de un proyecto, o tengas un rol en una práctica, aquí verás qué atender.</Empty>
      ) : (
        <div className="space-y-4">
          {(practices.length > 1 || pms.length > 1) && (
            <div className="flex flex-wrap gap-3">
              {practices.length > 1 && (
                <Select aria-label="Práctica" value={practice} onChange={(e) => setPractice(e.target.value)} className="sm:w-56">
                  <option value="">Todas las prácticas</option>
                  {practices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </Select>
              )}
              {pms.length > 1 && (
                <Select aria-label="PM" value={pm} onChange={(e) => setPm(e.target.value)} className="sm:w-56">
                  <option value="">Todos los PM</option>
                  {pms.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Proyectos en riesgo" value={shown.filter((p) => p.band === 'risk').length} tone="bad" />
            <Stat label="Alertas críticas sin plan" value={sum((p) => p.counts.criticalAlerts)} tone="bad" />
            <Stat label="Acciones vencidas" value={sum((p) => p.counts.overdueActions)} tone="warn" />
            {decides ? <Stat label="Esperan tu decisión" value={sum((p) => p.counts.pendingDecisions)} tone="warn" />
              : <Stat label="Revisiones vencidas" value={shown.filter((p) => p.review?.status === 'overdue').length} tone="warn" />}
          </div>

          <Card title="Qué atender">
            {focus.length === 0 ? <p className="text-sm text-muted">Nada requiere tu atención en este momento.</p> : (
              <ul className="divide-y divide-line">
                {focus.map((f, index) => (
                  <li key={`${f.kind}-${f.projectId}-${f.subject ?? ''}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{(FOCUS[f.kind] ?? (() => f.kind))(f)}</span>
                      <span className="block text-xs text-muted">{f.projectName}{f.dueOn && f.kind !== 'review_overdue' && f.kind !== 'review_due' && ` · ${f.dueOn < center.today ? 'venció' : 'vence'} el ${f.dueOn}`}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={SEVERITY[f.severity]?.tone}>{SEVERITY[f.severity]?.label}</Badge>
                      <Button size="sm" onClick={() => onOpen(f.projectId, f.tab)}>Abrir</Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Proyectos">
            <ul className="divide-y divide-line">
              {shown.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <button type="button" className="min-w-0 text-left" onClick={() => onOpen(p.id, 'health')}>
                    <span className="block text-sm font-medium text-brand-strong hover:underline">{p.name}</span>
                    <span className="block text-xs text-muted">{p.code} · {p.clientName} · PM {p.pmName}{p.status === 'paused' && ' · pausado'}</span>
                  </button>
                  <span className="flex flex-wrap items-center gap-2">
                    {p.review && <Badge tone={REVIEW[p.review.status]?.tone}>Revisión: {REVIEW[p.review.status]?.label}</Badge>}
                    {p.confidenceLevel === 'low' && <Badge tone="amber">Confianza baja</Badge>}
                    {!p.assessed ? <Badge tone="amber">Evaluación no disponible</Badge>
                      : p.band ? <Badge tone={BAND[p.band]?.tone}>{Number(p.score).toFixed(0)} · {BAND[p.band]?.label}</Badge>
                        : <Badge>Sin evaluación</Badge>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Del score más bajo al más alto. Confianza: {shown.filter((p) => p.confidenceLevel).map((p) => CONFIDENCE[p.confidenceLevel!]).filter((v, i, all) => all.indexOf(v) === i).join(', ') || 'sin datos'}.</p>
          </Card>
        </div>
      )}
    </>
  );
}

const STATE: Record<AppNotification['state'], { label: string; tone: Tone }> = {
  actionable: { label: 'Requiere acción', tone: 'red' }, info: { label: 'Informativa', tone: 'neutral' }, attended: { label: 'Ya atendida', tone: 'green' },
};

// The inbox behind the bell. Reading a notification never resolves the alert or closes the action.
export function Notifications({ inbox, onChange, onOpen }: { inbox: Inbox | undefined; onChange: (inbox: Inbox) => void; onOpen: OpenProject }) {
  const [error, setError] = useState<string>();
  const run = (work: Promise<Inbox>) => work.then(onChange).catch((f) => setError(errorMessage(f)));
  return (
    <>
      <PageHeader title="Notificaciones" subtitle="Lo que pasó en tus proyectos. Marcar como leída no resuelve la alerta ni cierra la acción."
        actions={inbox && inbox.unread > 0 && <Button onClick={() => void run(api.readAllNotifications())}>Marcar todas como leídas</Button>} />
      {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}
      {!inbox && !error && <Loading />}
      {inbox?.items.length === 0 && <Empty title="No tienes notificaciones" />}
      {inbox && inbox.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {inbox.items.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className={`block text-sm ${n.readAt ? 'text-ink-soft' : 'font-semibold text-ink'}`}>{n.title}</span>
                  <span className="block text-xs text-muted">
                    {n.project.name} · {new Date(n.sentAt).toLocaleString('es-MX')}
                    {n.owner && ` · responsable ${n.owner.displayName}`}{n.dueOn && n.state === 'actionable' && ` · plazo ${n.dueOn}`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {n.state === 'actionable' && <Badge tone={SEVERITY[n.severity]?.tone}>{SEVERITY[n.severity]?.label}</Badge>}
                  <Badge tone={STATE[n.state].tone}>{STATE[n.state].label}</Badge>
                  {!n.readAt && <Button size="sm" variant="ghost" onClick={() => void run(api.readNotification(n.id))}>Leída</Button>}
                  <Button size="sm" onClick={() => { if (!n.readAt) void run(api.readNotification(n.id)); onOpen(n.project.id, n.tab); }}>Abrir</Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
