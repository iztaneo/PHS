import { type FormEvent, useEffect, useState } from 'react';
import { api, errorMessage, type Change, type HealthEvent, type PracticePerson, type ProjectDetail, type Task } from './api';
import { PendingReviews } from './Reviews';
import { Badge, Button, Card, Empty, Field, Input, Loading, Notice, PageHeader, Select, Textarea, type Tone } from './ui';

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  critical: { label: 'Crítica', tone: 'red' }, warning: { label: 'Advertencia', tone: 'amber' }, info: { label: 'Informativa', tone: 'neutral' },
};
const RESPONSE: Record<string, { label: string; tone: Tone }> = {
  missing: { label: 'Falta causa y plan', tone: 'red' }, pending: { label: 'En validación del líder', tone: 'amber' },
  returned: { label: 'Devuelta por el líder', tone: 'red' }, validated: { label: 'Plan validado', tone: 'green' },
};
const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pendiente', tone: 'neutral' }, in_progress: { label: 'En curso', tone: 'blue' }, blocked: { label: 'Bloqueada', tone: 'amber' },
  completed: { label: 'Completada', tone: 'green' }, cancelled: { label: 'Cancelada', tone: 'neutral' },
};
const PRIORITY: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const NEXT: Record<string, { to: string; label: string }[]> = {
  pending: [{ to: 'in_progress', label: 'Iniciar' }, { to: 'blocked', label: 'Bloquear' }, { to: 'completed', label: 'Completar' }, { to: 'cancelled', label: 'Cancelar' }],
  in_progress: [{ to: 'blocked', label: 'Bloquear' }, { to: 'completed', label: 'Completar' }, { to: 'cancelled', label: 'Cancelar' }],
  blocked: [{ to: 'in_progress', label: 'Reanudar' }, { to: 'completed', label: 'Completar' }, { to: 'cancelled', label: 'Cancelar' }],
};

function TaskRow({ task, showProject, onDone }: { task: Task; showProject?: boolean; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function move(to: string) {
    setBusy(true); setError(undefined);
    try {
      await api.transitionTask(task.id, task.revision, to, note.trim() || undefined);
      setNote('');
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{task.title}</p>
          <p className="text-xs text-muted">
            {showProject && `${task.projectName} · `}{task.owner.displayName} · vence {task.dueOn} · prioridad {PRIORITY[task.priority]}
            {task.automatic ? ' · automática' : ' · manual'}
          </p>
          {task.closureNote && <p className="mt-1 text-xs text-muted">Cierre: {task.closureNote}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {task.overdue && <Badge tone="red">Vencida</Badge>}
          <Badge tone={TASK_STATUS[task.status]?.tone}>{TASK_STATUS[task.status]?.label}</Badge>
        </div>
      </div>
      {error && <Notice tone="red">{error}</Notice>}
      {task.canUpdate && (
        <div className="flex flex-wrap gap-2">
          <Input aria-label={`Comentario para ${task.title}`} placeholder="Comentario (obligatorio al completar o cancelar)" className="min-h-8 flex-1"
            value={note} onChange={(e) => setNote(e.target.value)} />
          {(NEXT[task.status] ?? []).map((a) => (
            <Button key={a.to} size="sm" disabled={busy} variant={a.to === 'cancelled' ? 'danger' : 'secondary'} onClick={() => move(a.to)}>{a.label}</Button>
          ))}
        </div>
      )}
    </li>
  );
}

function EventCard({ event, changes, onDone }: { event: HealthEvent; changes: Change[]; onDone: () => void }) {
  const [form, setForm] = useState({ cause: '', kind: 'remediation' as 'remediation' | 'replan', plan: '', changeId: '' });
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = changes.filter((c) => !c.decision);

  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError(undefined);
    try {
      await work();
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const respond = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api.respondEvent(event.id, { cause: form.cause, kind: form.kind, plan: form.plan, changeId: form.kind === 'replan' ? form.changeId || null : null }));
  };
  const validate = (decision: 'validated' | 'returned') => {
    if (!comment.trim()) { setError('Escribe un comentario para registrar la decisión.'); return; }
    void run(() => api.validateResponse(event.response!.id, decision, comment.trim()));
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{event.title}</p>
          <p className="text-xs text-muted">
            Desde el {new Date(event.openedAt).toLocaleDateString('es-MX')}{event.episode > 1 && ` · episodio ${event.episode}`}
            {event.resolvedAt && ` · resuelta el ${new Date(event.resolvedAt).toLocaleDateString('es-MX')}: ${event.resolutionNote}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={SEVERITY[event.severity]?.tone}>{SEVERITY[event.severity]?.label}</Badge>
          {event.resolvedAt ? <Badge tone="green">Resuelta</Badge>
            : event.responseStatus !== 'not_required' && <Badge tone={RESPONSE[event.responseStatus]?.tone}>{RESPONSE[event.responseStatus]?.label}</Badge>}
        </div>
      </div>
      {event.task && (
        <p className="mt-3 text-sm text-ink-soft">
          Acción: {event.task.title} · {event.task.owner.displayName} · vence {event.task.dueOn} · {TASK_STATUS[event.task.status]?.label}
          {event.task.overdue && ' · vencida'}
        </p>
      )}
      {event.response && (
        <div className="mt-3 rounded-control bg-subtle p-3 text-sm">
          <p className="text-ink"><strong>Causa:</strong> {event.response.cause}</p>
          <p className="mt-1 text-ink"><strong>{event.response.kind === 'replan' ? 'Replanificación' : 'Plan de remediación'}:</strong> {event.response.plan}</p>
          <p className="mt-1 text-xs text-muted">
            {event.response.submittedBy.displayName} · {new Date(event.response.submittedAt).toLocaleDateString('es-MX')} · versión {event.response.revisionNo}
            {event.response.kind === 'replan' && ' · requiere que se apruebe el cambio vinculado en la pestaña Cambios'}
          </p>
          {event.response.validation && (
            <p className="mt-2 text-ink">
              <strong>{event.response.validation.decision === 'validated' ? 'Validado' : 'Devuelto'} por {event.response.validation.validator.displayName}:</strong>{' '}
              {event.response.validation.comment}
            </p>
          )}
        </div>
      )}
      {error && <div className="mt-3"><Notice tone="red">{error}</Notice></div>}
      {event.canValidate && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Input aria-label={`Comentario de validación para ${event.title}`} placeholder="Comentario de la validación (obligatorio)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => validate('validated')}>Validar plan</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => validate('returned')}>Devolver con observación</Button>
          </div>
        </div>
      )}
      {event.canRespond && (
        <form onSubmit={respond} className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="¿Por qué se desvió?" htmlFor={`cause-${event.id}`} className="sm:col-span-2">
            <Textarea id={`cause-${event.id}`} required rows={2} maxLength={2000} value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} />
          </Field>
          <Field label="Salida" htmlFor={`kind-${event.id}`}>
            <Select id={`kind-${event.id}`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'remediation' | 'replan' })}>
              <option value="remediation">Plan de remediación para cumplir la fecha</option>
              <option value="replan">Replanificación mediante un cambio</option>
            </Select>
          </Field>
          {form.kind === 'replan' && (
            <Field label="Propuesta de cambio" htmlFor={`change-${event.id}`} hint={pending.length === 0 ? 'Primero propón el cambio en la pestaña Cambios.' : undefined}>
              <Select id={`change-${event.id}`} required value={form.changeId} onChange={(e) => setForm({ ...form, changeId: e.target.value })}>
                <option value="">Selecciona…</option>
                {pending.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
          )}
          <Field label={form.kind === 'replan' ? 'Motivo de la replanificación' : 'Plan de remediación'} htmlFor={`plan-${event.id}`} className="sm:col-span-2">
            <Textarea id={`plan-${event.id}`} required rows={2} maxLength={4000} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
          </Field>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={busy}>Enviar a validación del líder</Button></div>
        </form>
      )}
    </Card>
  );
}

export function Alerts({ project, people }: { project: ProjectDetail; people: PracticePerson[] }) {
  const [events, setEvents] = useState<HealthEvent[]>();
  const [tasks, setTasks] = useState<Task[]>();
  const [changes, setChanges] = useState<Change[]>([]);
  const [form, setForm] = useState({ title: '', description: '', ownerId: '', dueOn: '', priority: 'medium' });
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();

  async function load() {
    try {
      // Events first: consulting them is what detects new conditions and closes resolved ones.
      setEvents(await api.events(project.id));
      setTasks(await api.tasks(project.id));
      api.changes(project.id).then(setChanges).catch(() => undefined);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  useEffect(() => { void load(); }, [project.id, project.revision]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await api.createTask(project.id, form, key);
      setForm({ title: '', description: '', ownerId: '', dueOn: '', priority: 'medium' }); setKey(crypto.randomUUID());
      await load();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  const open = events?.filter((e) => !e.resolvedAt) ?? [];
  const resolved = events?.filter((e) => e.resolvedAt) ?? [];

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      {!events && !error && <Loading />}
      {events && open.length === 0 && <Empty title="Sin alertas abiertas">No hay atrasos, desviaciones ni pendientes que requieran atención.</Empty>}
      {open.map((e) => <EventCard key={e.id} event={e} changes={changes} onDone={() => void load()} />)}
      {tasks && tasks.length > 0 && (
        <Card title="Acciones">
          <ul className="divide-y divide-line">{tasks.map((t) => <TaskRow key={t.id} task={t} onDone={() => void load()} />)}</ul>
        </Card>
      )}
      {project.capabilities.editOperation && (
        <Card title="Nueva acción manual">
          <form onSubmit={add} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Título" htmlFor="t-title" className="sm:col-span-2">
              <Input id="t-title" required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Responsable" htmlFor="t-owner">
              <Select id="t-owner" required value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Selecciona…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </Select>
            </Field>
            <Field label="Plazo" htmlFor="t-due">
              <Input id="t-due" type="date" required value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
            </Field>
            <Field label="Prioridad" htmlFor="t-priority">
              <Select id="t-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
              </Select>
            </Field>
            <div className="sm:col-span-2"><Button type="submit" variant="primary">Crear acción</Button></div>
          </form>
        </Card>
      )}
      {resolved.length > 0 && (
        <Card title="Alertas resueltas">
          <ul className="divide-y divide-line text-sm">
            {resolved.map((e) => (
              <li key={e.id} className="py-2 first:pt-0 last:pb-0">
                <span className="text-ink">{e.title}</span>
                <span className="block text-xs text-muted">Resuelta el {new Date(e.resolvedAt!).toLocaleDateString('es-MX')}: {e.resolutionNote}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// The inbox: everything assigned to me, in any project.
export function MyTasks() {
  const [tasks, setTasks] = useState<Task[]>();
  const [error, setError] = useState<string>();
  const load = () => api.myTasks().then(setTasks).catch((f) => setError(errorMessage(f)));
  useEffect(() => { void load(); }, []);
  return (
    <>
      <PageHeader title="Mis acciones" subtitle="Lo que tienes asignado en todos tus proyectos, por plazo, y las revisiones que esperan tu validación." />
      <PendingReviews />
      {error && <Notice tone="red">{error}</Notice>}
      {!tasks && !error && <Loading />}
      {tasks?.length === 0 && <Empty title="No tienes acciones abiertas" />}
      {tasks && tasks.length > 0 && (
        <Card><ul className="divide-y divide-line">{tasks.map((t) => <TaskRow key={t.id} task={t} showProject onDone={() => void load()} />)}</ul></Card>
      )}
    </>
  );
}
