import { ArrowLeft, Plus, Search } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  ApiError, api, errorMessage, type PracticePerson, type ProjectDetail, type ProjectFilters, type ProjectInput,
  type ProjectPage, type ServiceType, type SessionUser,
} from './api';
import { Changes } from './Changes';
import { Alerts } from './Governance';
import { ReviewsTab } from './Reviews';
import { HealthView } from './HealthView';
import { BaselineSection, Milestones, Team } from './ProjectSections';
import { Finance, Risks } from './RiskFinance';
import { JustificationBanner, RenewalsSection, StatusSection } from './StatusRenewals';
import { Badge, Button, Card, Empty, Facts, Field, Input, Loading, Notice, PageHeader, Select, Tabs, Textarea, type Tone } from './ui';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  planned: { label: 'Por iniciar', tone: 'neutral' },
  active: { label: 'En ejecución', tone: 'blue' },
  paused: { label: 'Pausado', tone: 'amber' },
  renewing: { label: 'En renovación', tone: 'amber' },
  closed: { label: 'Cerrado', tone: 'neutral' },
};
const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS[status]?.tone}>{STATUS[status]?.label ?? status}</Badge>;
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
    <>
      <PageHeader title="Proyectos" subtitle="Los proyectos y servicios a tu alcance."
        actions={canCreate && <Button variant="primary" onClick={onNew}><Plus size={16} aria-hidden />Crear proyecto</Button>} />
      <Card className="mb-4">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
          onSubmit={(event) => { event.preventDefault(); change({ q: search.trim() }); }}>
          <div className="relative">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-3 text-muted" />
            <Input aria-label="Buscar por nombre o código" placeholder="Buscar por nombre o código" className="pl-9"
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select aria-label="Cliente" value={filters.clientId} onChange={(event) => change({ clientId: event.target.value })}>
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="Tipo de servicio" value={filters.serviceTypeCode} onChange={(event) => change({ serviceTypeCode: event.target.value })}>
            <option value="">Todos los tipos</option>
            {types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </Select>
          <Select aria-label="Estado" value={filters.status} onChange={(event) => change({ status: event.target.value })}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </Select>
          <div className="flex gap-2">
            <Button type="submit">Buscar</Button>
            {filtered && <Button variant="ghost" onClick={() => { setSearch(''); setFilters(NO_FILTERS); }}>Limpiar</Button>}
          </div>
        </form>
      </Card>
      {error && <Notice tone="red">{error}</Notice>}
      {!page && !error && <Loading />}
      {page && page.total === 0 && (
        <Empty title={filtered ? 'Ningún proyecto coincide con la búsqueda' : 'Aún no hay proyectos a tu alcance'}>
          {!filtered && (canCreate ? 'Crea el primero para empezar a gobernar su salud.'
            : 'Pide a un administrador un rol de PM o líder para crear proyectos.')}
        </Empty>
      )}
      {page && page.total > 0 && (
        <>
          <ul className="grid gap-3 md:hidden">
            {page.items.map((project) => (
              <li key={project.id}>
                <button type="button" onClick={() => onOpen(project.id)}
                  className="w-full rounded-card border border-line bg-surface p-4 text-left shadow-card">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-xs text-muted">{project.code}</span>
                      <span className="block font-medium text-ink">{project.name}</span>
                    </span>
                    <StatusBadge status={project.status} />
                  </span>
                  {project.justificationRequired && <span className="mt-2 block"><Badge tone="red">Requiere justificación</Badge></span>}
                  <span className="mt-2 block text-sm text-muted">{project.clientName} · {project.serviceTypeName}</span>
                  <span className="block text-sm text-muted">PM {project.pmName} · {project.practiceName}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface shadow-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-muted">
                <tr>{['Proyecto', 'Cliente', 'Tipo', 'Estado', 'PM', 'Práctica'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {page.items.map((project) => (
                  <tr key={project.id} className="hover:bg-subtle">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onOpen(project.id)} className="text-left">
                        <span className="block font-medium text-brand-strong hover:underline">{project.name}</span>
                        <span className="block text-xs text-muted">{project.code}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">{project.clientName}</td>
                    <td className="px-4 py-3">{project.serviceTypeName}</td>
                    <td className="px-4 py-3"><StatusBadge status={project.status} />{project.justificationRequired && <span className="mt-1 block"><Badge tone="red">Requiere justificación</Badge></span>}</td>
                    <td className="px-4 py-3">{project.pmName}</td>
                    <td className="px-4 py-3">{project.practiceName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>{page.total} proyecto(s) · página {page.page} de {pages}</span>
            <span className="flex gap-2">
              <Button size="sm" disabled={page.page <= 1} onClick={() => change({ page: page.page - 1 })}>Anterior</Button>
              <Button size="sm" disabled={page.page >= pages} onClick={() => change({ page: page.page + 1 })}>Siguiente</Button>
            </span>
          </div>
        </>
      )}
    </>
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
      <Field label="Nombre" htmlFor="p-name" className="sm:col-span-2">
        <Input id="p-name" required maxLength={200} value={values.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Tipo de servicio" htmlFor="p-type">
        <Select id="p-type" required value={values.serviceTypeCode} onChange={(e) => set({ serviceTypeCode: e.target.value })}>
          <option value="">Selecciona…</option>
          {types.filter((t) => t.active || t.code === values.serviceTypeCode).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="PM" htmlFor="p-pm" hint={editing && !canReassign ? 'Solo un líder puede reasignar al PM.' : undefined}>
        <Select id="p-pm" required disabled={editing && !canReassign} value={values.pmId} onChange={(e) => set({ pmId: e.target.value })}>
          <option value="">Selecciona…</option>{options('pm')}
        </Select>
      </Field>
      <Field label="Líder" htmlFor="p-lead">
        <Select id="p-lead" required disabled={editing && !canReassign} value={values.leadId} onChange={(e) => set({ leadId: e.target.value })}>
          <option value="">Selecciona…</option>{options('lead')}
        </Select>
      </Field>
      <Field label="Responsable técnico" htmlFor="p-tech">
        <Select id="p-tech" required value={values.technicalOwnerId} onChange={(e) => set({ technicalOwnerId: e.target.value })}>
          <option value="">Selecciona…</option>{options()}
        </Select>
      </Field>
      <Field label="Sponsor (opcional)" htmlFor="p-sponsor">
        <Select id="p-sponsor" value={values.sponsorId} onChange={(e) => set({ sponsorId: e.target.value })}>
          <option value="">Sin sponsor</option>{options()}
        </Select>
      </Field>
      <Field label="Inicio" htmlFor="p-start">
        <Input id="p-start" type="date" required disabled={datesLocked} value={values.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
      </Field>
      <Field label="Fin" htmlFor="p-end" hint={datesLocked ? 'Las fechas son parte de la línea base; se modifican con un cambio aprobado.' : undefined}>
        <Input id="p-end" type="date" required disabled={datesLocked} value={values.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
      </Field>
      <Field label="Contacto del cliente para este proyecto" htmlFor="p-contact" className="sm:col-span-2">
        <Input id="p-contact" maxLength={500} value={values.clientContact} onChange={(e) => set({ clientContact: e.target.value })} />
      </Field>
      <Field label="Escalación de este proyecto" htmlFor="p-escalation" className="sm:col-span-2">
        <Textarea id="p-escalation" rows={2} maxLength={2000} value={values.escalationNotes} onChange={(e) => set({ escalationNotes: e.target.value })} />
      </Field>
      <Field label="Descripción" htmlFor="p-desc" className="sm:col-span-2">
        <Textarea id="p-desc" rows={3} maxLength={4000} value={values.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
    </>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 -ml-2"><ArrowLeft size={16} aria-hidden />Volver a proyectos</Button>;
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
    <>
      <BackButton onBack={onCancel} />
      <PageHeader title="Crear proyecto" subtitle="Registra qué se gobierna y quién responde." />
      <Card>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error && <div className="sm:col-span-2"><Notice tone="red">{error}</Notice></div>}
          <Field label="Práctica" htmlFor="p-practice">
            <Select id="p-practice" required value={values.practiceId} onChange={(e) => set({ practiceId: e.target.value })}>
              {practices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Código" htmlFor="p-code">
            <Input id="p-code" required maxLength={40} value={values.code} onChange={(e) => set({ code: e.target.value })} />
          </Field>
          <Field label="Cliente" htmlFor="p-client" className="sm:col-span-2" hint="Si el cliente ya existe, se reutiliza.">
            <Input id="p-client" required maxLength={200} value={values.clientName} onChange={(e) => set({ clientName: e.target.value })} />
          </Field>
          <ProjectFields values={values} set={set} people={people} types={types} editing={false} canReassign datesLocked={false} />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar proyecto'}</Button>
            <Button onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      </Card>
    </>
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

type Tab = 'health' | 'reviews' | 'alerts' | 'card' | 'team' | 'milestones' | 'risks' | 'baseline' | 'changes' | 'finance';
const TABS: readonly (readonly [Tab, string])[] = [
  ['health', 'Salud'], ['reviews', 'Revisión'], ['alerts', 'Alertas y acciones'], ['card', 'Ficha'], ['team', 'Equipo'], ['milestones', 'Hitos'], ['risks', 'Riesgos'], ['baseline', 'Línea base'], ['changes', 'Cambios'], ['finance', 'Economía'],
];

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
  const [tab, setTab] = useState<Tab>(created ? 'card' : 'health');

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
    return <><BackButton onBack={onBack} />{error ? <Notice tone="red">{error}</Notice> : <Loading />}</>;
  }
  const canEdit = project.capabilities.editOperation;
  // People the user may not list (no create permission in the practice) still appear by name.
  const named = [project.pm, project.lead, project.technicalOwner, ...(project.sponsor ? [project.sponsor] : [])];
  const known = people.length ? people : [...new Map(named.map((p) => [p.id, p])).values()]
    .map((p) => ({ ...p, email: '', roles: ['pm', 'lead'] as PracticePerson['roles'] }));

  return (
    <>
      <BackButton onBack={onBack} />
      <PageHeader title={project.name}
        subtitle={<>{project.code} · {project.clientName} · {project.practiceName}</>}
        actions={<><StatusBadge status={project.status} /><Badge>{project.hasBaseline ? 'Con línea base' : 'Sin línea base'}</Badge></>} />
      <div className="mb-4 space-y-3">
        <JustificationBanner project={project} onDone={() => void load(true)} />
        {notice && <Notice tone="green">{notice}</Notice>}
        {!project.hasBaseline && tab !== 'baseline' && (
          <Notice tone="amber" role="status">
            Siguiente paso: registra el equipo y los hitos, y después publica la línea base.{' '}
            <button type="button" className="font-medium underline" onClick={() => setTab('baseline')}>Ir a línea base</button>
          </Notice>
        )}
        {error && <Notice tone="red">{error}</Notice>}
        {conflict && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setConflict(false); setError(undefined); void load(true); }}>
              Conservar mis cambios y reintentar sobre la versión actual
            </Button>
            <Button variant="ghost" onClick={() => { setConflict(false); setError(undefined); void load(); }}>Descartar mis cambios</Button>
          </div>
        )}
      </div>
      {/* Economy is shown only to those who may see amounts (D05). */}
      <Tabs items={TABS.filter(([key]) => key !== 'finance' || project.capabilities.seeFinancials)} value={tab} onChange={setTab} />
      {tab === 'team' && <Team project={project} people={known} onChanged={() => void load(true)} />}
      {tab === 'milestones' && <Milestones project={project} people={known} onChanged={() => void load(true)} />}
      {tab === 'health' && <HealthView project={project} />}
      {tab === 'reviews' && <ReviewsTab project={project} people={known} onChanged={() => void load(true)} onNavigate={(next) => setTab(next as Tab)} />}
      {tab === 'alerts' && <Alerts project={project} people={known} />}
      {tab === 'changes' && <Changes project={project} onChanged={() => void load(true)} />}
      {tab === 'risks' && <Risks project={project} people={known} onChanged={() => void load(true)} />}
      {tab === 'finance' && project.capabilities.seeFinancials && <Finance project={project} people={known} onChanged={() => void load(true)} />}
      {tab === 'baseline' && <BaselineSection project={project} people={known} onChanged={() => void load(true)} />}
      {tab === 'card' && (
        <div className="space-y-4">
        <Card title="Ficha del proyecto" actions={<span className="text-xs text-muted">Moneda {project.currency} · zona {project.timezone} · versión {project.revision}</span>}>
          {canEdit ? (
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProjectFields values={values} set={(patch) => setValues((v) => ({ ...v!, ...patch }))} people={known} types={types}
                editing canReassign={project.capabilities.decide} datesLocked={project.hasBaseline} />
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
              </div>
            </form>
          ) : (
            <Facts items={[
              ['Tipo de servicio', project.serviceTypeName],
              ['Vigencia', `${project.startsOn} a ${project.endsOn}`],
              ['PM', project.pm.displayName],
              ['Líder', project.lead.displayName],
              ['Responsable técnico', project.technicalOwner.displayName],
              ['Sponsor', project.sponsor?.displayName ?? 'Sin sponsor'],
              ['Contacto del cliente para este proyecto', project.clientContact || 'Sin definir'],
              ['Escalación', project.escalationNotes || 'Sin definir'],
              ['Descripción', project.description || 'Sin descripción'],
            ]} />
          )}
        </Card>
        <StatusSection project={project} onChanged={() => void load(true)} />
        <RenewalsSection project={project} people={known} onChanged={() => void load(true)} />
        </div>
      )}
    </>
  );
}
