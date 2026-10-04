import { type FormEvent, useEffect, useState } from 'react';
import {
  ApiError, api, errorMessage, type Baseline, type Member, type Milestone, type MilestoneStatus, type PracticePerson,
  type ProjectDetail,
} from './api';

const input = { padding: 6, marginRight: 8, marginBottom: 8 } as const;
const cell = { padding: '6px 8px', borderBottom: '1px solid #ccc', textAlign: 'left', verticalAlign: 'top' } as const;
const table = { borderCollapse: 'collapse', width: '100%', marginBottom: 12 } as const;

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

  return (
    <section>
      <h3>Equipo</h3>
      <p>
        Responsables: PM {project.pm.displayName} · Líder {project.lead.displayName} · Técnico {project.technicalOwner.displayName}
        {project.sponsor && ` · Sponsor ${project.sponsor.displayName}`}. Se cambian en la ficha.
      </p>
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      {pending && (
        <p role="alert" style={{ background: '#fff6dd', padding: 8 }}>
          {pending.text} Reasigna esos elementos antes de quitarlo, o confirma que los conserva: seguirá pudiendo consultar el proyecto.{' '}
          <button type="button" onClick={() => remove(pending.member, true)}>Quitar y conservar sus responsabilidades</button>{' '}
          <button type="button" onClick={() => setPending(undefined)}>No quitar</button>
        </p>
      )}
      {!members && !error && <p>Cargando…</p>}
      {members?.length === 0 && <p>Aún no hay integrantes además de los responsables.</p>}
      {members && members.length > 0 && (
        <table style={table}>
          <thead><tr>{['Integrante', 'Función', 'Asignación', ''].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td style={cell}>{m.displayName}{!m.active && ' (deshabilitado)'}<br />{m.email}</td>
                <td style={cell}>{MEMBER_ROLE[m.role]}</td>
                <td style={cell}>{m.allocationPct === null ? 'Sin definir' : `${m.allocationPct}%`}</td>
                <td style={cell}>{canEdit && <button type="button" disabled={busy} onClick={() => remove(m, false)}>Quitar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={add}>
          <select aria-label="Persona" required style={input} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Agregar o actualizar integrante…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}{p.email && ` · ${p.email}`}</option>)}
          </select>
          <select aria-label="Función" style={input} value={role} onChange={(e) => setRole(e.target.value as Member['role'])}>
            <option value="contributor">Colaborador</option>
            <option value="viewer">Lector</option>
          </select>
          <input aria-label="Asignación en porcentaje" type="number" min={0} max={100} placeholder="% asignación" style={{ ...input, width: 110 }}
            value={allocation} onChange={(e) => setAllocation(e.target.value)} />
          <button type="submit" disabled={busy}>Guardar integrante</button>
        </form>
      )}
    </section>
  );
}

const STATUS: Record<MilestoneStatus, string> = {
  pending: 'Pendiente', in_progress: 'En curso', completed: 'Cumplido', rescheduled: 'Reprogramado', cancelled: 'Cancelado',
};
const NEXT: Record<MilestoneStatus, { to: string; label: string; note: boolean }[]> = {
  pending: [{ to: 'in_progress', label: 'Iniciar', note: false }, { to: 'completed', label: 'Completar', note: true }, { to: 'cancelled', label: 'Cancelar', note: true }],
  in_progress: [{ to: 'completed', label: 'Completar', note: true }, { to: 'cancelled', label: 'Cancelar', note: true }],
  rescheduled: [{ to: 'in_progress', label: 'Iniciar', note: false }, { to: 'completed', label: 'Completar', note: true }, { to: 'cancelled', label: 'Cancelar', note: true }],
  completed: [{ to: 'in_progress', label: 'Reabrir', note: true }],
  cancelled: [{ to: 'pending', label: 'Reabrir', note: true }],
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
    <section>
      <h3>Hitos</h3>
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      {!items && !error && <p>Cargando…</p>}
      {items?.length === 0 && <p>Aún no hay hitos. {canEdit && 'Registra los entregables antes de publicar la línea base.'}</p>}
      {items && items.length > 0 && (
        <table style={table}>
          <thead><tr>{['Hito', 'Responsable', 'Fecha', 'Estado', 'Acciones'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td style={cell}><strong>{m.title}</strong>{m.critical && ' · Crítico'}<br />{m.deliverable}</td>
                <td style={cell}>{m.owner.displayName}</td>
                <td style={cell}>
                  {m.dueOn}
                  {m.committedDueOn && m.committedDueOn !== m.dueOn && <><br />Comprometida: {m.committedDueOn}</>}
                  {!m.committedDueOn && project.hasBaseline && <><br />Fuera de la línea base</>}
                </td>
                <td style={cell}>
                  {STATUS[m.status]}{m.overdue && <strong> · Vencido</strong>}
                  {m.completedOn && <><br />Cumplido el {m.completedOn}: {m.completionNote}</>}
                </td>
                <td style={cell}>
                  {m.canUpdate && (
                    <>
                      <input aria-label={`Comentario para ${m.title}`} placeholder="Comentario" style={{ ...input, width: 150 }}
                        value={notes[m.id] ?? ''} onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })} />
                      {NEXT[m.status].map((action) => (
                        <button key={action.to} type="button" disabled={busy} style={{ marginRight: 4 }}
                          onClick={() => run(async () => {
                            await api.transitionMilestone(project.id, m.id, m.revision, action.to, note(m) || undefined);
                            setNotes({ ...notes, [m.id]: '' });
                            await load();
                          })}>{action.label}</button>
                      ))}
                    </>
                  )}
                  {canEdit && m.status !== 'completed' && m.status !== 'cancelled' && (
                    <div>
                      <input aria-label={`Nueva fecha de ${m.title}`} type="date" style={input}
                        value={dates[m.id] ?? ''} onChange={(e) => setDates({ ...dates, [m.id]: e.target.value })} />
                      <button type="button" disabled={busy || !dates[m.id]}
                        onClick={() => run(async () => {
                          await api.updateMilestone(project.id, m.id, m.revision, { dueOn: dates[m.id], ...(note(m) ? { reason: note(m) } : {}) });
                          setDates({ ...dates, [m.id]: '' }); setNotes({ ...notes, [m.id]: '' });
                          await load();
                        })}>{m.committedDueOn ? 'Reprogramar (usa el comentario como motivo)' : 'Cambiar fecha'}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={add}>
          <input aria-label="Nombre del hito" placeholder="Nombre del hito" required maxLength={200} style={input}
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input aria-label="Entregable" placeholder="Entregable" maxLength={2000} style={input}
            value={form.deliverable} onChange={(e) => setForm({ ...form, deliverable: e.target.value })} />
          <select aria-label="Responsable del hito" required style={input} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
            <option value="">Responsable…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
          <input aria-label="Fecha compromiso" type="date" required style={input}
            value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
          <label style={{ marginRight: 8 }}>
            <input type="checkbox" checked={form.critical} onChange={(e) => setForm({ ...form, critical: e.target.checked })} /> Crítico
          </label>
          <button type="submit" disabled={busy}>Registrar hito</button>
        </form>
      )}
    </section>
  );
}

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
    <section>
      <h3>Línea base</h3>
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      {!baselines && !error && <p>Cargando…</p>}
      {baselines && !current && !project.capabilities.editOperation && <p>El proyecto aún no tiene línea base.</p>}
      {baselines && !current && project.capabilities.editOperation && (
        <form onSubmit={publish}>
          <p>Revisa lo que quedará comprometido. Después de publicar, la línea base no se puede modificar: los compromisos solo cambian mediante un cambio aprobado.</p>
          <ul>
            <li>Vigencia: {project.startsOn} a {project.endsOn} · moneda {project.currency}</li>
            <li>Equipo: PM {project.pm.displayName}, líder {project.lead.displayName}, técnico {project.technicalOwner.displayName}
              {members.map((m) => `, ${m.displayName} (${MEMBER_ROLE[m.role]}${m.allocationPct === null ? '' : ` ${m.allocationPct}%`})`)}</li>
            <li>{open.length} hito(s):{open.length === 0 && ' ninguno. La línea base quedará sin compromisos de entrega.'}
              <ul>{open.map((m) => <li key={m.id}>{m.dueOn} · {m.title}{m.critical && ' · Crítico'} · {m.owner.displayName}</li>)}</ul>
            </li>
          </ul>
          <label htmlFor="b-scope">Alcance</label>
          <textarea id="b-scope" required rows={3} maxLength={4000} style={{ display: 'block', width: '100%', maxWidth: 520, marginBottom: 12 }}
            value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
          <input aria-label="Presupuesto" placeholder={`Presupuesto (${project.currency})`} inputMode="decimal" pattern="\d{1,16}(\.\d{1,2})?" style={input}
            value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          <input aria-label="Esfuerzo en horas" placeholder="Esfuerzo (horas)" inputMode="decimal" pattern="\d{1,16}(\.\d{1,2})?" style={input}
            value={form.effortHours} onChange={(e) => setForm({ ...form, effortHours: e.target.value })} />
          {form.budget.trim() === '' && <p style={{ background: '#fff6dd', padding: 8 }}>Sin presupuesto: se guardará como desconocido y la salud financiera no podrá evaluarse.</p>}
          <button type="submit" disabled={busy}>{busy ? 'Publicando…' : 'Publicar línea base v1'}</button>
        </form>
      )}
      {current && (
        <>
          <p>
            <strong>Versión {current.version}</strong> · vigente · publicada por {current.createdBy.displayName} el {new Date(current.createdAt).toLocaleDateString('es-MX')}
          </p>
          <ul>
            <li>Vigencia: {current.startsOn} a {current.endsOn}</li>
            <li>Alcance: {current.scope}</li>
            <li>Presupuesto: {amount(current.budget, current.financialsHidden, current.currency)}</li>
            <li>Esfuerzo: {amount(current.effortHours, current.financialsHidden, 'horas')}</li>
            <li>Equipo: {current.team.map((t) => `${t.display_name} (${t.role})`).join(', ')}</li>
          </ul>
          {current.milestones.length === 0 ? <p>Sin hitos comprometidos.</p> : (
            <table style={table}>
              <thead><tr>{['Hito comprometido', 'Entregable', 'Fecha', 'Responsable'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {current.milestones.map((m) => (
                  <tr key={m.id}>
                    <td style={cell}>{m.title}{m.critical && ' · Crítico'}</td><td style={cell}>{m.deliverable}</td>
                    <td style={cell}>{m.due_on}</td><td style={cell}>{m.owner_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
