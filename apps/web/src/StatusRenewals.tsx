import { type FormEvent, useEffect, useState } from 'react';
import { api, errorMessage, type PracticePerson, type ProjectDetail, type Renewal, type StatusView } from './api';
import { Badge, Button, Card, Field, Input, Loading, Notice, Select, Textarea } from './ui';

const STATUS: Record<string, string> = {
  planned: 'Por iniciar', active: 'En ejecución', paused: 'Pausado', renewing: 'En renovación', closed: 'Cerrado',
};
const ACTION: Record<string, string> = {
  active: 'Poner en ejecución', paused: 'Pausar', renewing: 'Pasar a renovación', closed: 'Cerrar proyecto',
};

// D08: shown on every tab while the explanation is owed.
export function JustificationBanner({ project, onDone }: { project: ProjectDetail; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!project.justificationRequired) return null;
  const canJustify = project.capabilities.editOperation;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(undefined);
    try {
      await api.justifyStatus(project.id, reason);
      setReason('');
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Notice tone="red" role="alert">
      <p className="font-medium">Este proyecto lleva un mes o más {project.status === 'closed' ? 'cerrado' : 'pausado'} sin explicación.</p>
      {canJustify ? (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <label htmlFor="justification" className="block text-sm">Describe el motivo de la situación. No se podrá editar el proyecto hasta guardarlo.</label>
          <Textarea id="justification" required rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <p>{error}</p>}
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar motivo'}</Button>
        </form>
      ) : <p className="mt-1 text-sm">El PM o el líder deben describir el motivo.</p>}
    </Notice>
  );
}

export function StatusSection({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  const [view, setView] = useState<StatusView>();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.projectStatus(project.id).then(setView).catch((f) => setError(errorMessage(f))); }, [project.id, project.revision, project.justificationRequired]);

  async function change(to: string) {
    if (!reason.trim()) { setError('Escribe el motivo del cambio de estado.'); return; }
    setBusy(true); setError(undefined);
    try {
      await api.changeStatus(project.id, project.revision, to, reason.trim());
      setReason('');
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <Card title="Estado del proyecto">{error ? <Notice tone="red">{error}</Notice> : <Loading />}</Card>;
  const openTotal = view.open.milestones + view.open.risks + view.open.renewals + view.open.tasks;

  return (
    <Card title="Estado del proyecto" actions={<Badge tone={view.status === 'active' ? 'blue' : view.status === 'paused' ? 'amber' : 'neutral'}>{STATUS[view.status]}</Badge>}>
      <div className="space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        <p className="text-sm text-muted">
          {view.daysInStatus === null ? 'Sin cambios de estado registrados.' : `En este estado desde hace ${view.daysInStatus} día(s).`}{' '}
          Si permanece pausado o cerrado {view.justificationAfterDays} días, se pedirá describir el motivo.
        </p>
        {view.allowed.length > 0 && (
          <div className="space-y-2">
            {openTotal > 0 && (
              <Notice tone="amber">
                Hay {view.open.milestones} hito(s), {view.open.risks} riesgo(s), {view.open.renewals} renovación(es) y {view.open.tasks} acción(es) abiertos.
                Pausar o cerrar no los elimina.
              </Notice>
            )}
            <Input aria-label="Motivo del cambio de estado" placeholder="Motivo del cambio de estado (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {view.allowed.map((to) => (
                <Button key={to} size="sm" disabled={busy} variant={to === 'closed' ? 'danger' : 'secondary'} onClick={() => change(to)}>{ACTION[to] ?? to}</Button>
              ))}
            </div>
          </div>
        )}
        {view.history.length > 0 && (
          <ol className="space-y-2 text-sm">
            {view.history.map((h) => (
              <li key={h.recordedAt} className="rounded-control bg-subtle px-3 py-2">
                <span className="block text-ink">
                  {h.kind === 'justification' ? `Justificación (${STATUS[h.toStatus]})` : `${STATUS[h.fromStatus ?? '']} → ${STATUS[h.toStatus]}`}: {h.reason}
                </span>
                <span className="block text-xs text-muted">{new Date(h.recordedAt).toLocaleDateString('es-MX')} · {h.recordedBy.displayName}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

export function RenewalsSection({ project, people, onChanged }: { project: ProjectDetail; people: PracticePerson[]; onChanged: () => void }) {
  const [items, setItems] = useState<Renewal[]>();
  const [form, setForm] = useState({ dueOn: '', ownerId: '', notes: '' });
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canEdit = project.capabilities.editOperation && !project.justificationRequired;

  const load = () => api.renewals(project.id).then(setItems).catch((f) => setError(errorMessage(f)));
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
    if (await run(async () => { await api.createRenewal(project.id, form, key); })) { setForm({ dueOn: '', ownerId: '', notes: '' }); setKey(crypto.randomUUID()); }
  }

  async function decide(renewal: Renewal, outcome: 'renewed' | 'cancelled') {
    const comment = comments[renewal.id]?.trim() ?? '';
    if (!comment) { setError('Escribe un comentario para registrar el resultado.'); return; }
    await run(async () => { await api.decideRenewal(project.id, renewal.id, renewal.revision, outcome, comment); });
  }

  return (
    <Card title="Renovaciones">
      <div className="space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        {!items && !error && <Loading />}
        {items?.length === 0 && <p className="text-sm text-muted">No hay renovaciones registradas.</p>}
        <ul className="divide-y divide-line">
          {items?.map((r) => (
            <li key={r.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-ink">{r.dueOn}</span>
                <span className="flex-1 text-muted">{r.owner.displayName}{r.notes && ` · ${r.notes}`}</span>
                {r.status === 'pending'
                  ? <Badge tone={r.overdue ? 'red' : r.daysToDue <= 45 ? 'amber' : 'neutral'}>{r.overdue ? `Vencida hace ${-r.daysToDue} día(s)` : `En ${r.daysToDue} día(s)`}</Badge>
                  : <Badge tone={r.status === 'renewed' ? 'green' : 'neutral'}>{r.status === 'renewed' ? 'Renovada' : 'Cancelada'}</Badge>}
              </div>
              {r.outcomeNote && <p className="text-sm text-muted">Resultado: {r.outcomeNote}</p>}
              {r.canUpdate && (
                <div className="flex flex-wrap gap-2">
                  <Input aria-label={`Comentario del resultado de la renovación del ${r.dueOn}`} placeholder="Comentario del resultado (obligatorio)" className="min-h-8 flex-1"
                    value={comments[r.id] ?? ''} onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })} />
                  <Button size="sm" disabled={busy} onClick={() => decide(r, 'renewed')}>Renovada</Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => decide(r, 'cancelled')}>Cancelada</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form onSubmit={add} className="grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <Field label="Fecha de renovación" htmlFor="rn-date">
              <Input id="rn-date" type="date" required value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
            </Field>
            <Field label="Responsable" htmlFor="rn-owner">
              <Select id="rn-owner" required value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Selecciona…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </Select>
            </Field>
            <Field label="Notas" htmlFor="rn-notes">
              <Input id="rn-notes" maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>Registrar</Button>
          </form>
        )}
      </div>
    </Card>
  );
}
