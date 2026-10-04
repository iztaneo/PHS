import { type FormEvent, useEffect, useState } from 'react';
import {
  ApiError, api, errorMessage, type PracticePerson, type ProjectDetail, type ProjectFilters, type ProjectInput,
  type ProjectPage, type ServiceType, type SessionUser,
} from './api';
import { BaselineSection, Milestones, Team } from './ProjectSections';

const STATUS: Record<string, string> = {
  planned: 'Por iniciar', active: 'En ejecución', paused: 'Pausado', renewing: 'En renovación', closed: 'Cerrado',
};
const input = { padding: 6, marginRight: 8, marginBottom: 8 } as const;
const wide = { display: 'block', width: '100%', maxWidth: 520, padding: 6, margin: '4px 0 12px', boxSizing: 'border-box' } as const;
const cell = { padding: '6px 8px', borderBottom: '1px solid #ccc', textAlign: 'left' } as const;
const NO_FILTERS: ProjectFilters = { q: '', clientId: '', serviceTypeCode: '', status: '', page: 1 };

type Screen = { name: 'list' } | { name: 'new' } | { name: 'detail'; id: string; created?: boolean };

export function Projects({ user }: { user: SessionUser }) {
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const creatable = user.memberships.filter((m) => m.role !== 'director');
  const practices = [...new Map(creatable.map((m) => [m.practiceId, m.practiceName])).entries()];

  if (screen.name === 'new') {
    return (
      <ProjectForm user={user} practices={practices} onCancel={() => setScreen({ name: 'list' })}
        onSaved={(project) => setScreen({ name: 'detail', id: project.id, created: true })} />
    );
  }
  if (screen.name === 'detail') {
    return <ProjectCard id={screen.id} created={screen.created} onBack={() => setScreen({ name: 'list' })} />;
  }
  return (
    <ProjectList canCreate={practices.length > 0} onNew={() => setScreen({ name: 'new' })}
      onOpen={(id) => setScreen({ name: 'detail', id })} />
  );
}

function ProjectList({ canCreate, onNew, onOpen }: { canCreate: boolean; onNew: () => void; onOpen: (id: string) => void }) {
  const [filters, setFilters] = useState<ProjectFilters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<ProjectPage>();
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.clients().then(setClients).catch(() => undefined);
    api.serviceTypes().then(setTypes).catch(() => undefined);
  }, []);
  useEffect(() => {
    let current = true;
    setError(undefined);
    api.projects(filters)
      .then((result) => { if (current) setPage(result); })
      .catch((failure) => { if (current) setError(errorMessage(failure)); });
    return () => { current = false; };
  }, [filters]);

  const change = (patch: Partial<ProjectFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const filtered = Boolean(filters.q || filters.clientId || filters.serviceTypeCode || filters.status);
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;

  return (
    <section>
      <h2>Proyectos</h2>
      <form onSubmit={(event) => { event.preventDefault(); change({ q: search.trim() }); }}>
        <input aria-label="Buscar por nombre o código" placeholder="Buscar por nombre o código" style={input}
          value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="submit" style={{ marginRight: 8 }}>Buscar</button>
        <select aria-label="Cliente" style={input} value={filters.clientId} onChange={(event) => change({ clientId: event.target.value })}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Tipo de servicio" style={input} value={filters.serviceTypeCode} onChange={(event) => change({ serviceTypeCode: event.target.value })}>
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
        <select aria-label="Estado" style={input} value={filters.status} onChange={(event) => change({ status: event.target.value })}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {filtered && <button type="button" onClick={() => { setSearch(''); setFilters(NO_FILTERS); }}>Limpiar</button>}
      </form>
      {canCreate && <p><button type="button" onClick={onNew}>Crear proyecto</button></p>}
      {error && <p role="alert">{error}</p>}
      {!page && !error && <p>Consultando…</p>}
      {page && page.total === 0 && (
        <p>{filtered ? 'Ningún proyecto coincide con la búsqueda.'
          : canCreate ? 'Aún no hay proyectos a tu alcance. Crea el primero.'
          : 'No hay proyectos a tu alcance. Pide a un administrador un rol de PM o líder para crear proyectos.'}</p>
      )}
      {page && page.total > 0 && (
        <>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>{['Código', 'Proyecto', 'Cliente', 'Tipo', 'Estado', 'PM', 'Práctica'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {page.items.map((project) => (
                <tr key={project.id}>
                  <td style={cell}>{project.code}</td>
                  <td style={cell}><button type="button" onClick={() => onOpen(project.id)}>{project.name}</button></td>
                  <td style={cell}>{project.clientName}</td>
                  <td style={cell}>{project.serviceTypeName}</td>
                  <td style={cell}>{STATUS[project.status] ?? project.status}</td>
                  <td style={cell}>{project.pmName}</td>
                  <td style={cell}>{project.practiceName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {page.total} proyecto(s) · página {page.page} de {pages}{' '}
            <button type="button" disabled={page.page <= 1} onClick={() => change({ page: page.page - 1 })}>Anterior</button>{' '}
            <button type="button" disabled={page.page >= pages} onClick={() => change({ page: page.page + 1 })}>Siguiente</button>
          </p>
        </>
      )}
    </section>
  );
}

interface FormValues {
  practiceId: string; code: string; name: string; description: string; clientName: string; serviceTypeCode: string;
  pmId: string; leadId: string; technicalOwnerId: string; sponsorId: string; startsOn: string; endsOn: string;
  clientContact: string; escalationNotes: string;
}

function ProjectFields({ values, set, people, types, editing, canReassign, datesLocked }: {
  values: FormValues; set: (patch: Partial<FormValues>) => void; people: PracticePerson[]; types: ServiceType[];
  editing: boolean; canReassign: boolean; datesLocked: boolean;
}) {
  const options = (role?: 'pm' | 'lead') => people
    .filter((p) => !role || p.roles.includes(role))
    .map((p) => <option key={p.id} value={p.id}>{p.displayName}{p.email && ` · ${p.email}`}</option>);
  return (
    <>
      <label htmlFor="p-name">Nombre</label>
      <input id="p-name" required maxLength={200} style={wide} value={values.name} onChange={(e) => set({ name: e.target.value })} />
      <label htmlFor="p-type">Tipo de servicio</label>
      <select id="p-type" required style={wide} value={values.serviceTypeCode} onChange={(e) => set({ serviceTypeCode: e.target.value })}>
        <option value="">Selecciona…</option>
        {types.filter((t) => t.active || t.code === values.serviceTypeCode).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
      </select>
      <label htmlFor="p-pm">PM</label>
      <select id="p-pm" required disabled={editing && !canReassign} style={wide} value={values.pmId} onChange={(e) => set({ pmId: e.target.value })}>
        <option value="">Selecciona…</option>{options('pm')}
      </select>
      <label htmlFor="p-lead">Líder</label>
      <select id="p-lead" required disabled={editing && !canReassign} style={wide} value={values.leadId} onChange={(e) => set({ leadId: e.target.value })}>
        <option value="">Selecciona…</option>{options('lead')}
      </select>
      <label htmlFor="p-tech">Responsable técnico</label>
      <select id="p-tech" required style={wide} value={values.technicalOwnerId} onChange={(e) => set({ technicalOwnerId: e.target.value })}>
        <option value="">Selecciona…</option>{options()}
      </select>
      <label htmlFor="p-sponsor">Sponsor (opcional)</label>
      <select id="p-sponsor" style={wide} value={values.sponsorId} onChange={(e) => set({ sponsorId: e.target.value })}>
        <option value="">Sin sponsor</option>{options()}
      </select>
      <label htmlFor="p-start">Inicio</label>
      <input id="p-start" type="date" required disabled={datesLocked} style={wide} value={values.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
      <label htmlFor="p-end">Fin</label>
      <input id="p-end" type="date" required disabled={datesLocked} style={wide} value={values.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
      {datesLocked && <p>Las fechas forman parte de la línea base vigente; se modifican mediante un cambio aprobado.</p>}
      <label htmlFor="p-contact">Contacto del cliente para este proyecto</label>
      <input id="p-contact" maxLength={500} style={wide} value={values.clientContact} onChange={(e) => set({ clientContact: e.target.value })} />
      <label htmlFor="p-escalation">Escalación de este proyecto</label>
      <textarea id="p-escalation" rows={2} maxLength={2000} style={wide} value={values.escalationNotes} onChange={(e) => set({ escalationNotes: e.target.value })} />
      <label htmlFor="p-desc">Descripción</label>
      <textarea id="p-desc" rows={3} maxLength={4000} style={wide} value={values.description} onChange={(e) => set({ description: e.target.value })} />
    </>
  );
}

function ProjectForm({ user, practices, onCancel, onSaved }: {
  user: SessionUser; practices: [string, string][]; onCancel: () => void; onSaved: (project: ProjectDetail) => void;
}) {
  // One key per opened form: retrying the same submission cannot create a second project.
  const [key] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState<FormValues>({
    practiceId: practices[0]?.[0] ?? '', code: '', name: '', description: '', clientName: '', serviceTypeCode: '',
    pmId: '', leadId: '', technicalOwnerId: '', sponsorId: '', startsOn: '', endsOn: '', clientContact: '', escalationNotes: '',
  });
  const [people, setPeople] = useState<PracticePerson[]>([]);
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormValues>) => setValues((v) => ({ ...v, ...patch }));

  useEffect(() => { api.serviceTypes().then(setTypes).catch((f) => setError(errorMessage(f))); }, []);
  useEffect(() => {
    if (!values.practiceId) return;
    api.people(values.practiceId)
      .then((list) => {
        setPeople(list);
        const me = list.find((p) => p.id === user.id);
        set({ pmId: me?.roles.includes('pm') ? user.id : '', leadId: me?.roles.includes('lead') ? user.id : '', technicalOwnerId: '', sponsorId: '' });
      })
      .catch((f) => setError(errorMessage(f)));
  }, [values.practiceId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(undefined);
    const payload: ProjectInput = { ...values, sponsorId: values.sponsorId || null };
    try {
      onSaved(await api.createProject(payload, key));
    } catch (failure) {
      // The form keeps everything the user typed.
      setError(failure instanceof ApiError && failure.code === 'code_taken' ? 'Ya existe un proyecto con ese código.' : errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Crear proyecto</h2>
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      <label htmlFor="p-practice">Práctica</label>
      <select id="p-practice" required style={wide} value={values.practiceId} onChange={(e) => set({ practiceId: e.target.value })}>
        {practices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <label htmlFor="p-code">Código</label>
      <input id="p-code" required maxLength={40} style={wide} value={values.code} onChange={(e) => set({ code: e.target.value })} />
      <label htmlFor="p-client">Cliente</label>
      <input id="p-client" required maxLength={200} style={wide} value={values.clientName} onChange={(e) => set({ clientName: e.target.value })} />
      <ProjectFields values={values} set={set} people={people} types={types} editing={false} canReassign datesLocked={false} />
      <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar proyecto'}</button>{' '}
      <button type="button" onClick={onCancel}>Cancelar</button>
    </form>
  );
}

function toValues(project: ProjectDetail): FormValues {
  return {
    practiceId: project.practiceId, code: project.code, name: project.name, description: project.description,
    clientName: project.clientName, serviceTypeCode: project.serviceTypeCode, pmId: project.pm.id, leadId: project.lead.id,
    technicalOwnerId: project.technicalOwner.id, sponsorId: project.sponsor?.id ?? '', startsOn: project.startsOn, endsOn: project.endsOn,
    clientContact: project.clientContact, escalationNotes: project.escalationNotes,
  };
}

function ProjectCard({ id, created, onBack }: { id: string; created?: boolean; onBack: () => void }) {
  const [project, setProject] = useState<ProjectDetail>();
  const [values, setValues] = useState<FormValues>();
  // What the form showed when the user started editing; only fields that differ from it are sent.
  const [base, setBase] = useState<FormValues>();
  const [people, setPeople] = useState<PracticePerson[]>([]);
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState(created ? 'Proyecto creado.' : undefined);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'card' | 'team' | 'milestones' | 'baseline'>('card');

  async function load(keepForm = false) {
    try {
      const loaded = await api.project(id);
      setProject(loaded);
      if (!keepForm) { setValues(toValues(loaded)); setBase(toValues(loaded)); }
      if (loaded.capabilities.editOperation) {
        api.people(loaded.practiceId).then(setPeople).catch(() => setPeople([]));
        api.serviceTypes().then(setTypes).catch(() => undefined);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  useEffect(() => { void load(); }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!project || !values) return;
    setBusy(true); setError(undefined); setNotice(undefined); setConflict(false);
    try {
      const all = {
        name: values.name, description: values.description, serviceTypeCode: values.serviceTypeCode,
        pmId: values.pmId, leadId: values.leadId, technicalOwnerId: values.technicalOwnerId,
        sponsorId: values.sponsorId || null, startsOn: values.startsOn, endsOn: values.endsOn,
        clientContact: values.clientContact, escalationNotes: values.escalationNotes,
      };
      // After a conflict the untouched fields may be stale; sending only the edited ones keeps the
      // other person's changes.
      const edited = Object.fromEntries(Object.entries(all).filter(([field]) =>
        values[field as keyof FormValues] !== base?.[field as keyof FormValues]));
      const saved = await api.updateProject(project.id, project.revision, edited);
      setProject(saved); setValues(toValues(saved)); setBase(toValues(saved)); setNotice('Cambios guardados.');
    } catch (failure) {
      setError(errorMessage(failure));
      setConflict(failure instanceof ApiError && failure.code === 'revision_conflict');
    } finally {
      setBusy(false);
    }
  }

  if (!project || !values) {
    return <section><p><button type="button" onClick={onBack}>Volver a proyectos</button></p>{error ? <p role="alert">{error}</p> : <p>Cargando…</p>}</section>;
  }
  const canEdit = project.capabilities.editOperation;
  // People the user may not list (no create permission in the practice) still appear by name.
  const named = [project.pm, project.lead, project.technicalOwner, ...(project.sponsor ? [project.sponsor] : [])];
  const known = people.length ? people : [...new Map(named.map((p) => [p.id, p])).values()]
    .map((p) => ({ ...p, email: '', roles: ['pm', 'lead'] as PracticePerson['roles'] }));

  return (
    <section>
      <p><button type="button" onClick={onBack}>Volver a proyectos</button></p>
      <h2>{project.code} · {project.name}</h2>
      <p>
        {project.clientName} · {project.practiceName} · {STATUS[project.status] ?? project.status} · moneda {project.currency} ·
        zona {project.timezone} · versión {project.revision}
      </p>
      {notice && <p role="status" style={{ background: '#eef6ee', padding: 8 }}>{notice}</p>}
      {!project.hasBaseline && tab !== 'baseline' && (
        <p style={{ background: '#fff6dd', padding: 8 }}>
          Siguiente paso: registra el equipo y los hitos, y después publica la línea base.{' '}
          <button type="button" onClick={() => setTab('baseline')}>Ir a línea base</button>
        </p>
      )}
      <nav style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        {([['card', 'Ficha'], ['team', 'Equipo'], ['milestones', 'Hitos'], ['baseline', 'Línea base']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-current={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>
      {tab === 'team' && <Team project={project} people={known} onChanged={() => void load(true)} />}
      {tab === 'milestones' && <Milestones project={project} people={known} onChanged={() => void load(true)} />}
      {tab === 'baseline' && <BaselineSection project={project} people={known} onChanged={() => void load(true)} />}
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      {conflict && (
        <p>
          <button type="button" onClick={() => { setConflict(false); setError(undefined); void load(true); }}>
            Conservar mis cambios y reintentar sobre la versión actual
          </button>{' '}
          <button type="button" onClick={() => { setConflict(false); setError(undefined); void load(); }}>Descartar mis cambios</button>
        </p>
      )}
      {tab === 'card' && (canEdit ? (
        <form onSubmit={submit}>
          <ProjectFields values={values} set={(patch) => setValues((v) => ({ ...v!, ...patch }))} people={known} types={types}
            editing canReassign={project.capabilities.decide} datesLocked={project.hasBaseline} />
          <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </form>
      ) : (
        <dl>
          <dt>Tipo de servicio</dt><dd>{project.serviceTypeName}</dd>
          <dt>PM</dt><dd>{project.pm.displayName}</dd>
          <dt>Líder</dt><dd>{project.lead.displayName}</dd>
          <dt>Responsable técnico</dt><dd>{project.technicalOwner.displayName}</dd>
          <dt>Sponsor</dt><dd>{project.sponsor?.displayName ?? 'Sin sponsor'}</dd>
          <dt>Vigencia</dt><dd>{project.startsOn} a {project.endsOn}</dd>
          <dt>Contacto del cliente para este proyecto</dt><dd>{project.clientContact || 'Sin definir'}</dd>
          <dt>Escalación</dt><dd>{project.escalationNotes || 'Sin definir'}</dd>
          <dt>Descripción</dt><dd>{project.description || 'Sin descripción'}</dd>
        </dl>
      ))}
    </section>
  );
}
