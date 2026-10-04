import { type FormEvent, useEffect, useState } from 'react';
import {
  ApiError, api, errorMessage, type Baseline, type Member, type Milestone, type MilestoneStatus, type PracticePerson,
  type ProjectDetail,
} from './api';
import { EvidencePanel } from './EvidencePanel';
import { Badge, Button, Card, Empty, Facts, Field, Input, Loading, Notice, Select, Textarea, type Tone } from './ui';

interface SectionProps {
  project: ProjectDetail;
  people: PracticePerson[];
  // Children change the project revision; the card reloads it without touching what the user typed.
  onChanged: () => void;
}

function useAction(onChanged: () => void) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<void>): Promise<boolean> {
    setBusy(true); setError(undefined);
    try {
      await work();
      onChanged();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { error, setError, busy, run };
}

const MEMBER_ROLE = { contributor: 'Colaborador', viewer: 'Lector' } as const;

export function Team({ project, people, onChanged }: SectionProps) {
  const [members, setMembers] = useState<Member[]>();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Member['role']>('contributor');
  const [allocation, setAllocation] = useState('');
  const [pending, setPending] = useState<{ member: Member; text: string }>();
  const { error, setError, busy, run } = useAction(onChanged);
  const canEdit = project.capabilities.editOperation;

  useEffect(() => { api.members(project.id).then(setMembers).catch((f) => setError(errorMessage(f))); }, [project.id]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const pct = allocation.trim() === '' ? null : Number(allocation);
    if (await run(async () => setMembers(await api.putMember(project.id, userId, role, pct)))) { setUserId(''); setAllocation(''); }
  }

  async function remove(member: Member, keep: boolean) {
    setPending(undefined); setError(undefined);
    try {
      setMembers(await api.removeMember(project.id, member.userId, keep));
      onChanged();
    } catch (failure) {
      const r = failure instanceof ApiError ? failure.responsibilities : undefined;
      if (r) {
        setPending({ member, text: `${member.displayName} es responsable de ${r.milestones} hito(s), ${r.risks} riesgo(s), ${r.renewals} renovación(es) y ${r.tasks} acción(es) abiertos.` });
      } else {
        setError(errorMessage(failure));
      }
    }
  }

  const responsibles: [string, string][] = [
    ['PM', project.pm.displayName], ['Líder', project.lead.displayName], ['Responsable técnico', project.technicalOwner.displayName],
    ...(project.sponsor ? [['Sponsor', project.sponsor.displayName] as [string, string]] : []),
  ];

  return (
    <div className="space-y-4">
      <Card title="Responsables" actions={<span className="text-xs text-muted">Se cambian en la ficha</span>}>
        <Facts items={responsibles} />
      </Card>
      <Card title="Equipo">
        <div className="space-y-3">
          {error && <Notice tone="red">{error}</Notice>}
          {pending && (
            <Notice tone="amber" role="alert">
              <p>{pending.text} Reasigna esos elementos antes de quitarlo, o confirma que los conserva: seguirá pudiendo consultar el proyecto.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => remove(pending.member, true)}>Quitar y conservar sus responsabilidades</Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(undefined)}>No quitar</Button>
              </div>
            </Notice>
          )}
          {!members && !error && <Loading />}
          {members?.length === 0 && <Empty title="Aún no hay integrantes">Además de los responsables, agrega a quienes colaboran o consultan.</Empty>}
          {members && members.length > 0 && (
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{m.displayName}{!m.active && ' (deshabilitado)'}</p>
                    <p className="truncate text-xs text-muted">{m.email}</p>
                  </div>
                  <Badge tone={m.role === 'contributor' ? 'blue' : 'neutral'}>{MEMBER_ROLE[m.role]}</Badge>
                  <span className="w-24 text-sm text-muted">{m.allocationPct === null ? 'Sin definir' : `${m.allocationPct}%`}</span>
                  {canEdit && <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(m, false)}>Quitar</Button>}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <form onSubmit={add} className="grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Select aria-label="Persona" required value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Agregar o actualizar integrante…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}{p.email && ` · ${p.email}`}</option>)}
              </Select>
              <Select aria-label="Función" value={role} onChange={(e) => setRole(e.target.value as Member['role'])}>
                <option value="contributor">Colaborador</option>
                <option value="viewer">Lector</option>
              </Select>
              <Input aria-label="Asignación en porcentaje" type="number" min={0} max={100} placeholder="% asignación"
                value={allocation} onChange={(e) => setAllocation(e.target.value)} />
              <Button type="submit" variant="primary" disabled={busy}>Guardar</Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

const STATUS: Record<MilestoneStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pendiente', tone: 'neutral' },
  in_progress: { label: 'En curso', tone: 'blue' },
  completed: { label: 'Cumplido', tone: 'green' },
  rescheduled: { label: 'Reprogramado', tone: 'amber' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};
const NEXT: Record<MilestoneStatus, { to: string; label: string }[]> = {
  pending: [{ to: 'in_progress', label: 'Iniciar' }, { to: 'completed', label: 'Completar' }, { to: 'cancelled', label: 'Cancelar' }],
  in_progress: [{ to: 'completed', label: 'Completar' }, { to: 'cancelled', label: 'Cancelar' }],
  rescheduled: [{ to: 'in_progress', label: 'Iniciar' }, { to: 'completed', label: 'Completar' }, { to: 'cancelled', label: 'Cancelar' }],
  completed: [{ to: 'in_progress', label: 'Reabrir' }],
  cancelled: [{ to: 'pending', label: 'Reabrir' }],
};

export function Milestones({ project, people, onChanged }: SectionProps) {
  const [items, setItems] = useState<Milestone[]>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ title: '', deliverable: '', ownerId: '', dueOn: '', critical: false });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const { error, setError, busy, run } = useAction(onChanged);
  const canEdit = project.capabilities.editOperation;

  const load = () => api.milestones(project.id).then(setItems).catch((f) => setError(errorMessage(f)));
  useEffect(() => { void load(); }, [project.id]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run(async () => { await api.createMilestone(project.id, form, key); await load(); })) {
      setForm({ title: '', deliverable: '', ownerId: '', dueOn: '', critical: false });
      setKey(crypto.randomUUID());
    }
  }
  const note = (m: Milestone) => notes[m.id]?.trim() ?? '';

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      {!items && !error && <Loading />}
      {items?.length === 0 && (
        <Empty title="Aún no hay hitos">{canEdit && 'Registra los entregables antes de publicar la línea base.'}</Empty>
      )}
      {items?.map((m) => (
        <Card key={m.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{m.title}</p>
              {m.deliverable && <p className="text-sm text-muted">{m.deliverable}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {m.critical && <Badge tone="red">Crítico</Badge>}
              {m.overdue && <Badge tone="red">Vencido</Badge>}
              <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
            </div>
          </div>
          <div className="mt-4">
            <Facts items={[
              ['Responsable', m.owner.displayName],
              ['Fecha', <>{m.dueOn}{m.committedDueOn && m.committedDueOn !== m.dueOn && <span className="text-muted"> · comprometida {m.committedDueOn}</span>}
                {!m.committedDueOn && project.hasBaseline && <span className="text-muted"> · fuera de la línea base</span>}</>],
              ...(m.completedOn ? [['Cumplimiento', `${m.completedOn}: ${m.completionNote ?? ''}`] as [string, string]] : []),
            ]} />
          </div>
          {(m.canUpdate || canEdit) && (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <Input aria-label={`Comentario para ${m.title}`} placeholder="Comentario (obligatorio al completar, cancelar, reabrir o reprogramar)"
                value={notes[m.id] ?? ''} onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                {m.canUpdate && NEXT[m.status].map((action) => (
                  <Button key={action.to} size="sm" disabled={busy} variant={action.to === 'cancelled' ? 'danger' : 'secondary'}
                    onClick={() => run(async () => {
                      await api.transitionMilestone(project.id, m.id, m.revision, action.to, note(m) || undefined);
                      setNotes({ ...notes, [m.id]: '' });
                      await load();
                    })}>{action.label}</Button>
                ))}
                {canEdit && m.status !== 'completed' && m.status !== 'cancelled' && (
                  <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <Input aria-label={`Nueva fecha de ${m.title}`} type="date" className="w-auto min-h-8"
                      value={dates[m.id] ?? ''} onChange={(e) => setDates({ ...dates, [m.id]: e.target.value })} />
                    <Button size="sm" disabled={busy || !dates[m.id]}
                      onClick={() => run(async () => {
                        await api.updateMilestone(project.id, m.id, m.revision, { dueOn: dates[m.id], ...(note(m) ? { reason: note(m) } : {}) });
                        setDates({ ...dates, [m.id]: '' }); setNotes({ ...notes, [m.id]: '' });
                        await load();
                      })}>{m.committedDueOn ? 'Reprogramar' : 'Cambiar fecha'}</Button>
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="mt-4">
            <EvidencePanel projectId={project.id} kind="milestone" targetId={m.id} canAdd={m.canUpdate} canWithdraw={canEdit} />
          </div>
        </Card>
      ))}
      {canEdit && (
        <Card title="Registrar hito">
          <form onSubmit={add} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre del hito" htmlFor="m-title">
              <Input id="m-title" required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Entregable" htmlFor="m-deliverable">
              <Input id="m-deliverable" maxLength={2000} value={form.deliverable} onChange={(e) => setForm({ ...form, deliverable: e.target.value })} />
            </Field>
            <Field label="Responsable" htmlFor="m-owner">
              <Select id="m-owner" required value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Selecciona…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </Select>
            </Field>
            <Field label="Fecha compromiso" htmlFor="m-due">
              <Input id="m-due" type="date" required value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="size-4" checked={form.critical} onChange={(e) => setForm({ ...form, critical: e.target.checked })} />
              Hito crítico
            </label>
            <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={busy}>Registrar hito</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}

const TEAM_ROLE: Record<string, string> = {
  pm: 'PM', lead: 'Líder', technical_owner: 'Responsable técnico', sponsor: 'Sponsor', contributor: 'Colaborador', viewer: 'Lector',
};

export function BaselineSection({ project, onChanged }: SectionProps) {
  const [baselines, setBaselines] = useState<Baseline[]>();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [key] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ scope: '', budget: '', effortHours: '' });
  const { error, setError, busy, run } = useAction(onChanged);

  const load = () => api.baselines(project.id).then(setBaselines).catch((f) => setError(errorMessage(f)));
  useEffect(() => {
    void load();
    api.milestones(project.id).then(setMilestones).catch(() => undefined);
    api.members(project.id).then(setMembers).catch(() => undefined);
  }, [project.id, project.revision]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api.publishBaseline(project.id, {
        expectedRevision: project.revision, scope: form.scope,
        budget: form.budget.trim() || null, effortHours: form.effortHours.trim() || null,
      }, key);
      await load();
    });
  }

  const current = baselines?.find((b) => b.current);
  const open = milestones.filter((m) => m.status !== 'cancelled');
  const amount = (value: string | null, hidden: boolean, unit: string) =>
    hidden ? 'No visible para tu perfil' : value === null ? 'Desconocido' : `${value} ${unit}`;

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      {!baselines && !error && <Loading />}
      {baselines && !current && !project.capabilities.editOperation && <Empty title="El proyecto aún no tiene línea base" />}
      {baselines && !current && project.capabilities.editOperation && (
        <>
          <Card title="Lo que quedará comprometido">
            <Facts items={[
              ['Vigencia', `${project.startsOn} a ${project.endsOn}`],
              ['Moneda', project.currency],
              ['Responsables', `PM ${project.pm.displayName} · líder ${project.lead.displayName} · técnico ${project.technicalOwner.displayName}`],
              ['Equipo', members.length ? members.map((m) => `${m.displayName} (${MEMBER_ROLE[m.role]}${m.allocationPct === null ? '' : ` ${m.allocationPct}%`})`).join(', ') : 'Sin integrantes adicionales'],
            ]} />
            <h4 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted">{open.length} hito(s)</h4>
            {open.length === 0 ? <p className="text-sm text-muted">Ninguno. La línea base quedará sin compromisos de entrega.</p> : (
              <ul className="divide-y divide-line text-sm">
                {open.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="w-24 text-muted">{m.dueOn}</span>
                    <span className="min-w-0 flex-1 text-ink">{m.title}</span>
                    {m.critical && <Badge tone="red">Crítico</Badge>}
                    <span className="text-muted">{m.owner.displayName}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Publicar línea base v1">
            <form onSubmit={publish} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Notice tone="blue">Después de publicar, la línea base no se puede modificar: los compromisos solo cambian mediante un cambio aprobado.</Notice>
              </div>
              <Field label="Alcance" htmlFor="b-scope" className="sm:col-span-2">
                <Textarea id="b-scope" required rows={3} maxLength={4000} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
              </Field>
              <Field label={`Presupuesto (${project.currency})`} htmlFor="b-budget" hint="Opcional. Hasta dos decimales.">
                <Input id="b-budget" inputMode="decimal" pattern="\d{1,16}(\.\d{1,2})?" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </Field>
              <Field label="Esfuerzo (horas)" htmlFor="b-effort" hint="Opcional.">
                <Input id="b-effort" inputMode="decimal" pattern="\d{1,16}(\.\d{1,2})?" value={form.effortHours} onChange={(e) => setForm({ ...form, effortHours: e.target.value })} />
              </Field>
              {form.budget.trim() === '' && (
                <div className="sm:col-span-2"><Notice tone="amber">Sin presupuesto: se guardará como desconocido y la salud financiera no podrá evaluarse.</Notice></div>
              )}
              <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Publicando…' : 'Publicar línea base v1'}</Button></div>
            </form>
          </Card>
        </>
      )}
      {current && (
        <>
          <Card title={`Línea base v${current.version}${current.version > 1 ? ` · ${current.reason}` : ''}`} actions={<Badge tone="green">Vigente</Badge>}>
            <Facts items={[
              ['Publicada', `${new Date(current.createdAt).toLocaleDateString('es-MX')} por ${current.createdBy.displayName}`],
              ['Vigencia', `${current.startsOn} a ${current.endsOn}`],
              ['Presupuesto', amount(current.budget, current.financialsHidden, current.currency)],
              ['Esfuerzo', amount(current.effortHours, current.financialsHidden, 'horas')],
              ['Alcance', current.scope],
              ['Equipo', current.team.map((t) => `${t.display_name} (${TEAM_ROLE[t.role] ?? t.role})`).join(', ')],
            ]} />
          </Card>
          <Card title="Hitos comprometidos">
            {current.milestones.length === 0 ? <p className="text-sm text-muted">Sin hitos comprometidos.</p> : (
              <ul className="divide-y divide-line text-sm">
                {current.milestones.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <span className="w-24 text-muted">{m.due_on}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{m.title}</span>
                      {m.deliverable && <span className="block text-muted">{m.deliverable}</span>}
                    </span>
                    {m.critical && <Badge tone="red">Crítico</Badge>}
                    <span className="text-muted">{m.owner_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {baselines && baselines.length > 1 && (
            <Card title="Versiones anteriores">
              <ul className="divide-y divide-line text-sm">
                {baselines.filter((b) => !b.current).map((b) => (
                  <li key={b.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium text-ink">Versión {b.version} · {b.startsOn} a {b.endsOn}</p>
                    <p className="text-muted">
                      {b.reason} · presupuesto {amount(b.budget, b.financialsHidden, b.currency)} ·{' '}
                      {b.milestones.map((m) => `${m.title} ${m.due_on}`).join(', ') || 'sin hitos'}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
