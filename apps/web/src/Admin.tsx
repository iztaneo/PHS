import { type FormEvent, useEffect, useState } from 'react';
import {
  api, errorMessage, type AdminUser, type Practice, type PracticeRole, type ServiceType,
} from './api';

const ROLES: { key: PracticeRole; label: string }[] = [
  { key: 'pm', label: 'PM' },
  { key: 'lead', label: 'Líder' },
  { key: 'director', label: 'Dirección' },
];
const input = { padding: 6, marginRight: 8 } as const;
const cell = { padding: '6px 8px', borderBottom: '1px solid #ccc', textAlign: 'left', verticalAlign: 'top' } as const;

export function Admin({ currentUserId }: { currentUserId: string }) {
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
    <section>
      <h2>Administración</h2>
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      {notice && <p role="status" style={{ background: '#eef6ee', padding: 8 }}>{notice}</p>}

      <h3>Usuarios</h3>
      <NewUser onCreate={(email, name, isAdmin) => run(async () => {
        const created = await api.admin.createUser(email, name, isAdmin);
        return `Usuario ${created.user.email} creado. Contraseña temporal (se muestra una sola vez): ${created.temporaryPassword}`;
      })} />
      {!users && !error && <p>Cargando…</p>}
      {users && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr><th style={cell}>Usuario</th><th style={cell}>Estado</th><th style={cell}>Roles por práctica</th><th style={cell}>Acciones</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td style={cell}><strong>{user.displayName}</strong><br />{user.email}</td>
                <td style={cell}>{user.active ? 'Activo' : 'Deshabilitado'}{user.isAdmin && <><br />Administrador</>}</td>
                <td style={cell}>
                  {practices.length === 0 && 'Crea una práctica para asignar roles.'}
                  {practices.map((practice) => (
                    <div key={practice.id}>
                      {practice.name}:{' '}
                      {ROLES.map((role) => {
                        const granted = user.memberships.some((m) => m.practiceId === practice.id && m.role === role.key);
                        return (
                          <label key={role.key} style={{ marginRight: 8 }}>
                            <input type="checkbox" checked={granted} aria-label={`${role.label} en ${practice.name} para ${user.email}`}
                              onChange={() => run(async () => { replaceUser(await api.admin.setMembership(user.id, practice.id, role.key, !granted)); })} />
                            {role.label}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </td>
                <td style={cell}>
                  <button type="button" onClick={() => run(async () => {
                    const result = await api.admin.updateUser(user.id, { active: !user.active });
                    const r = result.responsibilities;
                    const open = r ? r.projectsAsPm + r.projectsAsLead + r.projectsAsTechnicalOwner : 0;
                    return open > 0
                      ? `${user.email} deshabilitado. Tiene responsabilidades por reasignar: ${r!.projectsAsPm} como PM, ${r!.projectsAsLead} como líder y ${r!.projectsAsTechnicalOwner} como responsable técnico.`
                      : undefined;
                  })}>{user.active ? 'Deshabilitar' : 'Habilitar'}</button>{' '}
                  <button type="button" onClick={() => run(async () => { await api.admin.updateUser(user.id, { isAdmin: !user.isAdmin }); })}>
                    {user.isAdmin ? 'Quitar administrador' : 'Hacer administrador'}
                  </button>{' '}
                  <button type="button" disabled={user.id === currentUserId} onClick={() => run(async () => {
                    const reset = await api.admin.resetPassword(user.id);
                    return `Contraseña temporal de ${user.email} (se muestra una sola vez): ${reset.temporaryPassword}`;
                  })}>Restablecer contraseña</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Prácticas</h3>
      <PairForm first="Código" second="Nombre" button="Crear práctica"
        onSubmit={(code, name) => run(async () => { await api.admin.createPractice(code, name); })} />
      {practices.length === 0 ? <p>Aún no hay prácticas.</p> : (
        <ul>{practices.map((p) => <li key={p.id}><strong>{p.code}</strong> · {p.name} · {p.timezone}</li>)}</ul>
      )}

      <h3>Tipos de servicio</h3>
      <PairForm first="Código (minúsculas)" second="Nombre" button="Agregar tipo"
        onSubmit={(code, name) => run(async () => { await api.admin.createServiceType(code, name); })} />
      <ul>
        {types.map((type) => (
          <li key={type.code}>
            {type.name} ({type.code}) · {type.active ? 'Activo' : 'Inactivo para nuevos proyectos'}{' '}
            <button type="button" onClick={() => run(async () => { await api.admin.setServiceTypeActive(type.code, !type.active); })}>
              {type.active ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
    </section>
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
    <form onSubmit={submit} style={{ marginBottom: 12 }}>
      <input aria-label="Correo del nuevo usuario" placeholder="Correo" type="email" required style={input}
        value={email} onChange={(event) => setEmail(event.target.value)} />
      <input aria-label="Nombre del nuevo usuario" placeholder="Nombre" required style={input}
        value={name} onChange={(event) => setName(event.target.value)} />
      <label style={{ marginRight: 8 }}>
        <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} /> Administrador
      </label>
      <button type="submit">Crear usuario</button>
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
    <form onSubmit={submit} style={{ marginBottom: 12 }}>
      <input aria-label={first} placeholder={first} required style={input} value={a} onChange={(event) => setA(event.target.value)} />
      <input aria-label={second} placeholder={second} required style={input} value={b} onChange={(event) => setB(event.target.value)} />
      <button type="submit">{button}</button>
    </form>
  );
}
