import { type FormEvent, useEffect, useState } from 'react';
import {
  api, errorMessage, type AdminUser, type Holiday, type Practice, type PracticeRole, type ServiceType,
} from './api';
import { Badge, Button, Card, Empty, Input, Loading, Notice, PageHeader, Tabs } from './ui';

const ROLES: { key: PracticeRole; label: string }[] = [
  { key: 'pm', label: 'PM' },
  { key: 'lead', label: 'Líder' },
  { key: 'director', label: 'Dirección' },
];
type Tab = 'users' | 'practices' | 'types' | 'holidays';
const TABS = [['users', 'Usuarios'], ['practices', 'Prácticas'], ['types', 'Tipos de servicio'], ['holidays', 'Días festivos']] as const;

export function Admin({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function load() {
    try {
      const [u, p, t] = await Promise.all([api.admin.users(), api.admin.practices(), api.admin.serviceTypes()]);
      setUsers(u); setPractices(p); setTypes(t);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  useEffect(() => { void load(); }, []);

  // Runs one change, then shows its confirmation only after the server accepted it.
  async function run(work: () => Promise<string | void>) {
    setError(undefined); setNotice(undefined);
    try {
      const message = await work();
      if (message) setNotice(message);
      await load();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  const replaceUser = (user: AdminUser) => setUsers((list) => list?.map((u) => (u.id === user.id ? user : u)));

  return (
    <>
      <PageHeader title="Administración" subtitle="Usuarios, prácticas, roles y catálogos." />
      <div className="mb-4 space-y-3">
        {error && <Notice tone="red">{error}</Notice>}
        {notice && <Notice tone="green"><span className="break-words">{notice}</span></Notice>}
      </div>
      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === 'users' && (
        <div className="space-y-4">
          <Card title="Nuevo usuario">
            <NewUser onCreate={(email, name, isAdmin) => run(async () => {
              const created = await api.admin.createUser(email, name, isAdmin);
              return `Usuario ${created.user.email} creado. Contraseña temporal (se muestra una sola vez): ${created.temporaryPassword}`;
            })} />
          </Card>
          {!users && !error && <Loading />}
          <div className="grid gap-4 xl:grid-cols-2">
            {users?.map((user) => (
              <Card key={user.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{user.displayName}</p>
                    <p className="truncate text-sm text-muted">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {user.isAdmin && <Badge tone="blue">Administrador</Badge>}
                    <Badge tone={user.active ? 'green' : 'neutral'}>{user.active ? 'Activo' : 'Deshabilitado'}</Badge>
                  </div>
                </div>
                <div className="mt-4 space-y-2 border-t border-line pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Roles por práctica</p>
                  {practices.length === 0 && <p className="text-sm text-muted">Crea una práctica para asignar roles.</p>}
                  {practices.map((practice) => (
                    <div key={practice.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="min-w-28 font-medium text-ink-soft">{practice.name}</span>
                      {ROLES.map((role) => {
                        const granted = user.memberships.some((m) => m.practiceId === practice.id && m.role === role.key);
                        return (
                          <label key={role.key} className="flex items-center gap-1.5">
                            <input type="checkbox" className="size-4" checked={granted} aria-label={`${role.label} en ${practice.name} para ${user.email}`}
                              onChange={() => run(async () => { replaceUser(await api.admin.setMembership(user.id, practice.id, role.key, !granted)); })} />
                            {role.label}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button size="sm" variant={user.active ? 'danger' : 'secondary'} onClick={() => run(async () => {
                    const result = await api.admin.updateUser(user.id, { active: !user.active });
                    const r = result.responsibilities;
                    const open = r ? r.projectsAsPm + r.projectsAsLead + r.projectsAsTechnicalOwner : 0;
                    return open > 0
                      ? `${user.email} deshabilitado. Tiene responsabilidades por reasignar: ${r!.projectsAsPm} como PM, ${r!.projectsAsLead} como líder y ${r!.projectsAsTechnicalOwner} como responsable técnico.`
                      : undefined;
                  })}>{user.active ? 'Deshabilitar' : 'Habilitar'}</Button>
                  <Button size="sm" onClick={() => run(async () => { await api.admin.updateUser(user.id, { isAdmin: !user.isAdmin }); })}>
                    {user.isAdmin ? 'Quitar administrador' : 'Hacer administrador'}
                  </Button>
                  <Button size="sm" disabled={user.id === currentUserId} onClick={() => run(async () => {
                    const reset = await api.admin.resetPassword(user.id);
                    return `Contraseña temporal de ${user.email} (se muestra una sola vez): ${reset.temporaryPassword}`;
                  })}>Restablecer contraseña</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'practices' && (
        <div className="space-y-4">
          <Card title="Nueva práctica">
            <PairForm first="Código" second="Nombre" button="Crear práctica"
              onSubmit={(code, name) => run(async () => { await api.admin.createPractice(code, name); })} />
          </Card>
          {practices.length === 0 ? <Empty title="Aún no hay prácticas">Crea la primera para poder asignar roles y registrar proyectos.</Empty> : (
            <Card>
              <ul className="divide-y divide-line">
                {practices.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Badge>{p.code}</Badge><span className="flex-1 text-sm font-medium text-ink">{p.name}</span>
                    <span className="text-xs text-muted">{p.timezone}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'types' && (
        <div className="space-y-4">
          <Card title="Nuevo tipo de servicio">
            <PairForm first="Código (minúsculas)" second="Nombre" button="Agregar tipo"
              onSubmit={(code, name) => run(async () => { await api.admin.createServiceType(code, name); })} />
          </Card>
          <Card>
            <ul className="divide-y divide-line">
              {types.map((type) => (
                <li key={type.code} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{type.name}</span>
                    <span className="block text-xs text-muted">{type.code}</span>
                  </span>
                  <Badge tone={type.active ? 'green' : 'neutral'}>{type.active ? 'Activo' : 'Inactivo para nuevos proyectos'}</Badge>
                  <Button size="sm" onClick={() => run(async () => { await api.admin.setServiceTypeActive(type.code, !type.active); })}>
                    {type.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'holidays' && <Holidays />}
    </>
  );
}

function NewUser({ onCreate }: { onCreate: (email: string, name: string, isAdmin: boolean) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onCreate(email, name, isAdmin);
    setEmail(''); setName(''); setIsAdmin(false);
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
      <Input aria-label="Correo del nuevo usuario" placeholder="nombre@empresa.com" type="email" required
        value={email} onChange={(event) => setEmail(event.target.value)} />
      <Input aria-label="Nombre del nuevo usuario" placeholder="Nombre completo" required
        value={name} onChange={(event) => setName(event.target.value)} />
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" className="size-4" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} /> Administrador
      </label>
      <Button type="submit" variant="primary">Crear usuario</Button>
    </form>
  );
}

function PairForm({ first, second, button, onSubmit }: {
  first: string; second: string; button: string; onSubmit: (a: string, b: string) => Promise<void>;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit(a, b);
    setA(''); setB('');
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
      <Input aria-label={first} placeholder={first} required value={a} onChange={(event) => setA(event.target.value)} />
      <Input aria-label={second} placeholder={second} required value={b} onChange={(event) => setB(event.target.value)} />
      <Button type="submit" variant="primary">{button}</Button>
    </form>
  );
}

// Days on which no review is due (D03). They change every year, so they are kept here.
function Holidays() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [items, setItems] = useState<Holiday[]>();
  const [day, setDay] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    setItems(undefined);
    api.holidays(year).then(setItems).catch((f) => setError(errorMessage(f)));
  }, [year]);

  async function run(work: () => Promise<Holiday[]>, shownYear: number) {
    setError(undefined);
    try {
      const saved = await work();
      if (shownYear === year) setItems(saved); else setYear(shownYear);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    void run(async () => { const saved = await api.addHoliday(day, name.trim()); setDay(''); setName(''); return saved; }, Number(day.slice(0, 4)));
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="red">{error}</Notice>}
      <Card title="Nuevo día festivo">
        <p className="mb-3 text-sm text-muted">Sábados y domingos ya son inhábiles. Una revisión que venza en fin de semana o en día festivo pasa al siguiente día hábil; el día de corte de los ciclos siguientes no cambia.</p>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <Input aria-label="Fecha" type="date" required value={day} onChange={(e) => setDay(e.target.value)} className="sm:w-48" />
          <Input aria-label="Nombre" placeholder="Nombre, por ejemplo Día de la Independencia" required maxLength={120} value={name}
            onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
          <Button type="submit" variant="primary">Agregar</Button>
        </form>
      </Card>
      <Card title={`Festivos de ${year}`} actions={(
        <span className="flex gap-2">
          <Button size="sm" onClick={() => setYear(year - 1)}>{year - 1}</Button>
          <Button size="sm" onClick={() => setYear(year + 1)}>{year + 1}</Button>
        </span>
      )}>
        {!items && !error && <Loading />}
        {items?.length === 0 && <Empty title={`No hay festivos registrados para ${year}`} />}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((h) => (
              <li key={h.day} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 text-sm text-ink">{h.day} · {h.name}</span>
                <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`¿Quitar el festivo del ${h.day}?`)) void run(() => api.removeHoliday(h.day), year); }}>Quitar</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
