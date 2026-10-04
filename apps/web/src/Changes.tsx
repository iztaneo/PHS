import { type FormEvent, useEffect, useState } from 'react';
import { api, errorMessage, type Change, type Milestone, type ProjectDetail } from './api';
import { Badge, Button, Card, Empty, Field, Input, Loading, Notice, Select, Textarea } from './ui';

const TYPE: Record<string, string> = { client: 'Del cliente', internal: 'Interno', regulatory: 'Regulatorio', technical: 'Técnico' };
const EMPTY = { title: '', description: '', changeType: 'client', endsOn: '', budgetDelta: '', scope: '', milestoneId: '', milestoneDueOn: '' };

export function Changes({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  const [items, setItems] = useState<Change[]>();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = () => api.changes(project.id).then(setItems).catch((f) => setError(errorMessage(f)));
  useEffect(() => {
    void load();
    api.milestones(project.id).then(setMilestones).catch(() => undefined);
  }, [project.id, project.revision]);

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

  async function propose(event: FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      await api.proposeChange(project.id, {
        title: form.title, description: form.description, changeType: form.changeType,
        impact: {
          ...(form.endsOn ? { endsOn: form.endsOn } : {}),
          ...(form.budgetDelta.trim() ? { budgetDelta: form.budgetDelta.trim() } : {}),
          ...(form.scope.trim() ? { scope: form.scope.trim() } : {}),
          milestones: form.milestoneId && form.milestoneDueOn ? [{ id: form.milestoneId, dueOn: form.milestoneDueOn }] : [],
        },
      }, key);
    });
    if (ok) { setForm(EMPTY); setKey(crypto.randomUUID()); }
  }

  async function decide(change: Change, decision: 'approved' | 'rejected') {
    const comment = comments[change.id]?.trim() ?? '';
    if (!comment) { setError('Escribe un comentario para registrar la decisión.'); return; }
    // The key is tied to the change and the decision, so pressing twice cannot decide twice.
    await run(async () => { await api.decideChange(project.id, change.id, decision, comment, `decide-${change.id}-${decision}`); });
  }

  const movable = milestones.filter((m) => m.committedDueOn && m.status !== 'completed' && m.status !== 'cancelled');

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      {!items && !error && <Loading />}
      {items?.length === 0 && <Empty title="Aún no hay cambios propuestos">Los compromisos de la línea base solo se modifican mediante un cambio aprobado.</Empty>}
      {items?.map((change) => (
        <Card key={change.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{change.title}</p>
              <p className="text-sm text-muted">{change.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{TYPE[change.changeType] ?? change.changeType}</Badge>
              <Badge tone={!change.decision ? 'amber' : change.decision.decision === 'approved' ? 'green' : 'neutral'}>
                {!change.decision ? 'Pendiente de decisión' : change.decision.decision === 'approved' ? 'Aprobado' : 'Rechazado'}
              </Badge>
            </div>
          </div>
          <ul className="mt-4 space-y-1 text-sm text-ink-soft">
            {change.impact.endsOn && <li>Fin del proyecto: {change.impact.endsOn.before} → <strong>{change.impact.endsOn.proposed}</strong></li>}
            {change.impact.budget && <li>Presupuesto: {change.impact.budget.before ?? 'desconocido'} → <strong>{change.impact.budget.proposed}</strong> ({Number(change.impact.budget.delta) >= 0 ? '+' : ''}{change.impact.budget.delta})</li>}
            {change.impact.effortHours && <li>Esfuerzo: {change.impact.effortHours.before ?? 'desconocido'} → <strong>{change.impact.effortHours.proposed}</strong> horas</li>}
            {change.impact.scope && <li>Alcance: <strong>{change.impact.scope.proposed}</strong></li>}
            {change.impact.milestones.map((m) => <li key={m.id}>Hito «{m.title}»: {m.before} → <strong>{m.proposed}</strong></li>)}
            {change.financialsHidden && <li className="text-muted">Incluye importes que no son visibles para tu perfil.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Propuesto por {change.proposedBy.displayName} el {new Date(change.proposedAt).toLocaleDateString('es-MX')} sobre la línea base v{change.impact.baselineVersion}.
            {change.decision && ` ${change.decision.decision === 'approved' ? 'Aprobado' : 'Rechazado'} por ${change.decision.decidedBy.displayName}: ${change.decision.comment}`}
            {change.decision?.baselineVersion && ` Originó la línea base v${change.decision.baselineVersion}.`}
          </p>
          {change.canDecide && (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <Input aria-label={`Comentario de la decisión sobre ${change.title}`} placeholder="Comentario de la decisión (obligatorio)"
                value={comments[change.id] ?? ''} onChange={(e) => setComments({ ...comments, [change.id]: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(change, 'approved')}>Aprobar y crear nueva línea base</Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => decide(change, 'rejected')}>Rechazar</Button>
              </div>
            </div>
          )}
        </Card>
      ))}
      {project.capabilities.proposeAndReview && project.hasBaseline && (
        <Card title="Proponer cambio">
          <form onSubmit={propose} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Notice tone="blue">Indica solo lo que cambia. La propuesta no se puede editar después de enviarla; para corregirla se envía otra.</Notice></div>
            <Field label="Título" htmlFor="c-title">
              <Input id="c-title" required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Origen" htmlFor="c-type">
              <Select id="c-type" value={form.changeType} onChange={(e) => setForm({ ...form, changeType: e.target.value })}>
                {Object.entries(TYPE).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Motivo" htmlFor="c-desc" className="sm:col-span-2">
              <Textarea id="c-desc" required rows={2} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Nueva fecha de fin del proyecto" htmlFor="c-end" hint={`Actual: ${project.endsOn}`}>
              <Input id="c-end" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
            </Field>
            {project.capabilities.seeFinancials && (
              <Field label={`Cambio de presupuesto (${project.currency})`} htmlFor="c-budget" hint="Positivo aumenta, negativo reduce.">
                <Input id="c-budget" inputMode="decimal" pattern="-?\d{1,16}(\.\d{1,2})?" value={form.budgetDelta} onChange={(e) => setForm({ ...form, budgetDelta: e.target.value })} />
              </Field>
            )}
            <Field label="Hito que cambia de fecha" htmlFor="c-milestone">
              <Select id="c-milestone" value={form.milestoneId} onChange={(e) => setForm({ ...form, milestoneId: e.target.value })}>
                <option value="">Ninguno</option>
                {movable.map((m) => <option key={m.id} value={m.id}>{m.title} · comprometido {m.committedDueOn}</option>)}
              </Select>
            </Field>
            <Field label="Nueva fecha comprometida del hito" htmlFor="c-mdate">
              <Input id="c-mdate" type="date" disabled={!form.milestoneId} required={Boolean(form.milestoneId)} value={form.milestoneDueOn} onChange={(e) => setForm({ ...form, milestoneDueOn: e.target.value })} />
            </Field>
            <Field label="Nuevo alcance (opcional)" htmlFor="c-scope" className="sm:col-span-2">
              <Textarea id="c-scope" rows={2} maxLength={4000} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
            </Field>
            <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={busy}>Enviar propuesta</Button></div>
          </form>
        </Card>
      )}
      {project.capabilities.proposeAndReview && !project.hasBaseline && (
        <Notice tone="amber">Publica la línea base antes de proponer cambios.</Notice>
      )}
    </div>
  );
}
