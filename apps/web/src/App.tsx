import { Bell, BookOpen, Briefcase, House, ListChecks, LogOut, Menu, PauseCircle, ShieldCheck, UserRound, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Admin } from './Admin';
import { ApiError, api, errorMessage, type Inbox, type SessionUser } from './api';
import { MyTasks } from './Governance';
import { Home, Notifications } from './Home';
import { InactiveProjects, PhfModel } from './Insight';
import { Projects } from './Projects';
import { Badge, Button, Card, Empty, Field, Input, Loading, Notice, PageHeader } from './ui';

type View = { name: 'loading' } | { name: 'login'; notice?: string } | { name: 'signed-in'; user: SessionUser };

export function App() {
  const [view, setView] = useState<View>({ name: 'loading' });

  useEffect(() => {
    api.session()
      .then(({ user }) => setView({ name: 'signed-in', user }))
      .catch((error) =>
        setView({ name: 'login', notice: error instanceof ApiError && error.status === 401 ? undefined : errorMessage(error) }));
  }, []);

  if (view.name === 'loading') return <Centered><Loading /></Centered>;
  if (view.name === 'login') {
    return <Centered><LoginForm notice={view.notice} onSignedIn={(user) => setView({ name: 'signed-in', user })} /></Centered>;
  }
  if (view.user.mustChangePassword) {
    return (
      <Centered>
        <PasswordForm
          onChanged={() => setView({ name: 'signed-in', user: { ...view.user, mustChangePassword: false } })}
          onSessionLost={() => setView({ name: 'login', notice: errorMessage(new ApiError(401, 'authentication_required')) })}
        />
      </Centered>
    );
  }
  return <Shell user={view.user} onSignedOut={(notice) => setView({ name: 'login', notice })} />;
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-xl bg-brand text-sm font-semibold text-white">PH</span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-ink">Project Health</span>
        <span className="block text-xs text-muted">System</span>
      </span>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Brand /></div>
        {children}
      </div>
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
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Iniciar sesión</h1>
        {error && <Notice tone="red">{error}</Notice>}
        <Field label="Correo" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
    </Card>
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
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cambia tu contraseña</h1>
          <p className="mt-1 text-sm text-muted">Tu contraseña es temporal. Debes cambiarla antes de continuar.</p>
        </div>
        {error && <Notice tone="red">{error}</Notice>}
        <Field label="Contraseña actual" htmlFor="current">
          <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
        </Field>
        <Field label="Nueva contraseña" htmlFor="next" hint="Mínimo 12 caracteres.">
          <Input id="next" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={next} onChange={(event) => setNext(event.target.value)} />
        </Field>
        <Field label="Confirma la nueva contraseña" htmlFor="repeat">
          <Input id="repeat" type="password" autoComplete="new-password" required value={repeat} onChange={(event) => setRepeat(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Cambiar contraseña'}</Button>
      </form>
    </Card>
  );
}

const ROLE_TEXT = { pm: 'PM', lead: 'Líder', director: 'Dirección' } as const;
type Section = 'home' | 'projects' | 'notifications' | 'tasks' | 'inactive' | 'model' | 'roles' | 'admin';

function Shell({ user, onSignedOut }: { user: SessionUser; onSignedOut: (notice?: string) => void }) {
  const [section, setSection] = useState<Section>('home');
  // A project to open from elsewhere (home, notifications). The counter makes the same request open again.
  const [target, setTarget] = useState<{ id: string; tab: string; n: number }>();
  const [inbox, setInbox] = useState<Inbox>();
  const open = (id: string, tab: string) => { setTarget((t) => ({ id, tab, n: (t?.n ?? 0) + 1 })); setSection('projects'); setMenuOpen(false); };
  // The bell keeps itself up to date; a failure just leaves the last known count.
  useEffect(() => {
    const load = () => { api.notifications().then(setInbox).catch(() => undefined); };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string>();

  const items: { key: Section; label: string; icon: ReactNode }[] = [
    { key: 'home', label: 'Inicio', icon: <House size={18} aria-hidden /> },
    { key: 'projects', label: 'Proyectos', icon: <Briefcase size={18} aria-hidden /> },
    { key: 'notifications', label: 'Notificaciones', icon: <Bell size={18} aria-hidden /> },
    { key: 'tasks', label: 'Mis acciones', icon: <ListChecks size={18} aria-hidden /> },
    { key: 'inactive', label: 'Pausados y cerrados', icon: <PauseCircle size={18} aria-hidden /> },
    { key: 'model', label: 'Modelo PHF', icon: <BookOpen size={18} aria-hidden /> },
    { key: 'roles', label: 'Mis roles', icon: <UserRound size={18} aria-hidden /> },
    ...(user.isAdmin ? [{ key: 'admin' as const, label: 'Administración', icon: <ShieldCheck size={18} aria-hidden /> }] : []),
  ];

  async function signOut() {
    try {
      await api.logout();
      onSignedOut();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  const nav = (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
      {items.map((item) => (
        <button key={item.key} type="button" aria-current={section === item.key ? 'page' : undefined}
          onClick={() => { setSection(item.key); setTarget(undefined); setMenuOpen(false); }}
          className={`flex min-h-10 items-center gap-3 rounded-control px-3 text-sm font-medium ${section === item.key ? 'bg-brand-soft text-brand-strong' : 'text-ink-soft hover:bg-subtle'}`}>
          {item.icon}{item.label}
          {item.key === 'notifications' && inbox && inbox.unread > 0 && (
            <span className="ml-auto rounded-full bg-bad px-2 py-0.5 text-xs font-semibold text-white" aria-label={`${inbox.unread} sin leer`}>{inbox.unread}</span>
          )}
        </button>
      ))}
    </nav>
  );
  const account = (
    <div className="border-t border-line pt-4">
      <p className="truncate text-sm font-medium text-ink">{user.displayName}</p>
      <p className="mb-3 truncate text-xs text-muted">{user.email}</p>
      <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start"><LogOut size={16} aria-hidden />Cerrar sesión</Button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-line bg-surface p-5 lg:flex">
        <Brand />{nav}{account}
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Brand />
        <Button variant="ghost" size="sm" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </Button>
      </header>
      {menuOpen && (
        <div className="sticky top-[61px] z-10 flex flex-col gap-4 border-b border-line bg-surface p-4 lg:hidden">{nav}{account}</div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}
        {section === 'admin' && user.isAdmin && <Admin currentUserId={user.id} />}
        {section === 'home' && <Home onOpen={open} />}
        {section === 'notifications' && <Notifications inbox={inbox} onChange={setInbox} onOpen={open} />}
        {section === 'projects' && <Projects user={user} target={target} />}
        {section === 'tasks' && <MyTasks />}
        {section === 'inactive' && <InactiveProjects onOpen={open} />}
        {section === 'model' && <PhfModel />}
        {section === 'roles' && (
          <>
            <PageHeader title="Mis roles" subtitle="Lo que puedes ver y hacer depende de estos roles." />
            {user.memberships.length === 0 && !user.isAdmin ? (
              <Empty title="Aún no tienes roles asignados">Pide acceso a un administrador.</Empty>
            ) : (
              <Card>
                <ul className="divide-y divide-line">
                  {user.isAdmin && (
                    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <Badge tone="blue">Administrador</Badge>
                      <span className="text-sm text-muted">Usuarios, prácticas y catálogos. Este rol no da acceso a proyectos.</span>
                    </li>
                  )}
                  {user.memberships.map((m) => (
                    <li key={`${m.practiceId}-${m.role}`} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <Badge>{ROLE_TEXT[m.role]}</Badge><span className="text-sm text-ink">{m.practiceName}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <p className="mt-4 text-xs text-muted">Los roles se actualizan al recargar la página.</p>
          </>
        )}
      </main>
    </div>
  );
}
