import { type FormEvent, useEffect, useState } from 'react';
import { Admin } from './Admin';
import { ApiError, api, errorMessage, type SessionUser } from './api';
import { Projects } from './Projects';

type View = { name: 'loading' } | { name: 'login'; notice?: string } | { name: 'signed-in'; user: SessionUser };

const page = { fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '32px auto', padding: '0 16px' } as const;
const field = { display: 'block', width: '100%', maxWidth: 420, padding: 8, margin: '4px 0 16px', boxSizing: 'border-box' } as const;

export function App() {
  const [view, setView] = useState<View>({ name: 'loading' });

  useEffect(() => {
    api.session()
      .then(({ user }) => setView({ name: 'signed-in', user }))
      .catch((error) =>
        setView({ name: 'login', notice: error instanceof ApiError && error.status === 401 ? undefined : errorMessage(error) }));
  }, []);

  return (
    <main style={page}>
      <h1>Project Health System</h1>
      {view.name === 'loading' && <p>Cargando…</p>}
      {view.name === 'login' && (
        <LoginForm notice={view.notice} onSignedIn={(user) => setView({ name: 'signed-in', user })} />
      )}
      {view.name === 'signed-in' && view.user.mustChangePassword && (
        <PasswordForm
          onChanged={() => setView({ name: 'signed-in', user: { ...view.user, mustChangePassword: false } })}
          onSessionLost={() => setView({ name: 'login', notice: errorMessage(new ApiError(401, 'authentication_required')) })}
        />
      )}
      {view.name === 'signed-in' && !view.user.mustChangePassword && (
        <Home user={view.user} onSignedOut={(notice) => setView({ name: 'login', notice })} />
      )}
    </main>
  );
}

function LoginForm({ notice, onSignedIn }: { notice?: string; onSignedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onSignedIn((await api.login(email, password)).user);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Iniciar sesión</h2>
      {error && <p role="alert">{error}</p>}
      <label htmlFor="email">Correo</label>
      <input id="email" type="email" autoComplete="username" required style={field}
        value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="password">Contraseña</label>
      <input id="password" type="password" autoComplete="current-password" required style={field}
        value={password} onChange={(event) => setPassword(event.target.value)} />
      <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}

function PasswordForm({ onChanged, onSessionLost }: { onChanged: () => void; onSessionLost: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== repeat) {
      setError('La nueva contraseña y su confirmación no coinciden.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.changePassword(current, next);
      onChanged();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'authentication_required') {
        onSessionLost();
        return;
      }
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Cambia tu contraseña</h2>
      <p>Tu contraseña es temporal. Debes cambiarla antes de continuar.</p>
      {error && <p role="alert">{error}</p>}
      <label htmlFor="current">Contraseña actual</label>
      <input id="current" type="password" autoComplete="current-password" required style={field}
        value={current} onChange={(event) => setCurrent(event.target.value)} />
      <label htmlFor="next">Nueva contraseña (mínimo 12 caracteres)</label>
      <input id="next" type="password" autoComplete="new-password" required minLength={12} maxLength={128} style={field}
        value={next} onChange={(event) => setNext(event.target.value)} />
      <label htmlFor="repeat">Confirma la nueva contraseña</label>
      <input id="repeat" type="password" autoComplete="new-password" required style={field}
        value={repeat} onChange={(event) => setRepeat(event.target.value)} />
      <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
    </form>
  );
}

const ROLE_TEXT = { pm: 'PM', lead: 'Líder', director: 'Dirección' } as const;

function Home({ user, onSignedOut }: { user: SessionUser; onSignedOut: (notice?: string) => void }) {
  const [tab, setTab] = useState<'projects' | 'roles' | 'admin'>('projects');
  const [error, setError] = useState<string>();

  async function signOut() {
    try {
      await api.logout();
      onSignedOut();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <section>
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button type="button" onClick={() => setTab('projects')} aria-current={tab === 'projects'}>Proyectos</button>
        <button type="button" onClick={() => setTab('roles')} aria-current={tab === 'roles'}>Mis roles</button>
        {user.isAdmin && (
          <button type="button" onClick={() => setTab('admin')} aria-current={tab === 'admin'}>Administración</button>
        )}
        <span style={{ marginLeft: 'auto' }}>{user.displayName} · {user.email}</span>
        <button type="button" onClick={signOut}>Cerrar sesión</button>
      </nav>
      {error && <p role="alert">{error}</p>}
      {tab === 'admin' && user.isAdmin && <Admin currentUserId={user.id} />}
      {tab === 'projects' && <Projects user={user} />}
      {tab === 'roles' && (
        <>
          <h2>Mis roles</h2>
          {user.memberships.length === 0 && !user.isAdmin && <p>Aún no tienes roles asignados. Pide acceso a un administrador.</p>}
          <ul>
            {user.isAdmin && <li>Administrador (usuarios, prácticas y catálogos; sin acceso a proyectos por este rol)</li>}
            {user.memberships.map((m) => <li key={`${m.practiceId}-${m.role}`}>{ROLE_TEXT[m.role]} en {m.practiceName}</li>)}
          </ul>
          <p>Los roles se actualizan al volver a iniciar sesión o recargar la página.</p>
        </>
      )}
    </section>
  );
}
