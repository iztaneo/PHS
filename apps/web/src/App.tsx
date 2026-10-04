import { type FormEvent, useEffect, useState } from 'react';
import { ApiError, api, errorMessage, type ServiceStatus, type SessionUser } from './api';

type View = { name: 'loading' } | { name: 'login'; notice?: string } | { name: 'signed-in'; user: SessionUser };

const page = { fontFamily: 'system-ui, sans-serif', maxWidth: 440, margin: '48px auto', padding: '0 16px' } as const;
const field = { display: 'block', width: '100%', padding: 8, margin: '4px 0 16px', boxSizing: 'border-box' } as const;

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

const STATUS_TEXT: Record<ServiceStatus['status'], string> = {
  ok: 'Disponible',
  degraded: 'Con problemas',
  unreachable: 'Sin respuesta',
};

function Home({ user, onSignedOut }: { user: SessionUser; onSignedOut: (notice?: string) => void }) {
  const [services, setServices] = useState<ServiceStatus[]>();
  const [propagated, setPropagated] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.status().then((status) => setServices(status.services)).catch((failure) => setError(errorMessage(failure)));
    api.whoami()
      .then((who) => setPropagated(who.userId === user.id ? 'Proyectos reconoce tu identidad.' : 'Proyectos recibió otra identidad.'))
      .catch((failure) => {
        if (failure instanceof ApiError && failure.status === 401) onSignedOut(errorMessage(failure));
        else setPropagated('Proyectos no respondió.');
      });
  }, [user.id]);

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
      <h2>Hola, {user.displayName}</h2>
      <p>Sesión iniciada como {user.email}.</p>
      {error && <p role="alert">{error}</p>}
      <h3>Servicios</h3>
      {!services && !error && <p>Consultando…</p>}
      {services && (
        <ul>
          {services.map((service) => (
            <li key={service.service}>
              <strong>{service.service}</strong>: {STATUS_TEXT[service.status]}
              {service.database && ` · base de datos ${service.database === 'ok' ? 'conectada' : 'sin conexión'}`}
            </li>
          ))}
        </ul>
      )}
      <p>{propagated ?? 'Comprobando identidad en Proyectos…'}</p>
      <button type="button" onClick={signOut}>Cerrar sesión</button>
    </section>
  );
}
