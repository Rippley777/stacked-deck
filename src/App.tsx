import { useEffect, useState, lazy, Suspense, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Monitor,
  Layers,
  FolderKanban,
  MapPin,
  Sparkles,
  LogOut,
  ArrowUpRight,
  ChevronRight,
  Menu,
  X,
  Check,
  LockKeyhole,
  ArrowRight,
  Search,
} from 'lucide-react';
import type { User } from '../shared/types';
import { api, ApiError } from './api';
import { AppContext } from './context';
import { Logo, Loading, ErrorState } from './components/ui';
import { DeckIllustration } from './components/HardwareArt';
import { ItemForm } from './components/ItemForm';
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const InventoryPage = lazy(() => import('./pages/Inventory'));
const RecommendationsPage = lazy(() => import('./pages/Recommendations'));
const ProjectsPage = lazy(() => import('./pages/Projects'));
const SystemsPage = lazy(() => import('./pages/Systems'));
const LocationsPage = lazy(() => import('./pages/Locations'));
const links = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/deck', label: 'Your deck', icon: Layers },
  { path: '/systems', label: 'Computers', icon: Monitor },
  { path: '/projects', label: 'Projects', icon: FolderKanban },
  { path: '/locations', label: 'Locations', icon: MapPin },
];
function Auth({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      onSuccess(
        await api<User>(`/auth/${register ? 'register' : 'login'}`, {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(form)),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="auth-pitch">
          <span className="eyebrow">LESS SEARCHING. MORE BUILDING.</span>
          <h1>
            Good things
            <br />
            are already
            <br />
            in your <em>deck.</em>
          </h1>
          <p>Your forgotten boards, spare drives, and next great idea. All in one place.</p>
          <DeckIllustration />
        </div>
        <span className="auth-foot">A little organization. A lot of possibility.</span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form">
          <span className="eyebrow">YOUR NEXT BUILD STARTS HERE</span>
          <h2>{register ? 'Make room for possibility.' : 'Welcome back.'}</h2>
          <p>
            {register
              ? 'Create your account and start stacking your deck.'
              : 'Your hardware has potential. Let’s put it to work.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label className="field">
                <span>Your name</span>
                <input
                  name="name"
                  required
                  autoComplete="name"
                  maxLength={160}
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label className="field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'At least 12 characters' : 'Your password'}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? 'One moment…' : register ? 'Create your account' : 'Sign in to your deck'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Already have a deck?' : 'New around here?'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <div className="auth-private">
            <LockKeyhole size={14} />
            Your inventory is private. Always your own.
          </div>
        </div>
      </section>
    </main>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [revision, setRevision] = useState(0);
  const [add, setAdd] = useState(false);
  const [toast, setToast] = useState('');
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const check = () => {
    setChecking(true);
    setAuthError('');
    api<User>('/auth/me')
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) setAuthError(e.message);
      })
      .finally(() => setChecking(false));
  };
  useEffect(() => {
    check();
    const expired = () => {
      setUser(null);
      setToast('Your session expired. Please sign in again.');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        user &&
        event.key.toLowerCase() === 'd' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !target.closest('input, textarea, select, [contenteditable]') &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        navigate('/deck');
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [user, navigate]);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      setUser(null);
      navigate('/');
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  if (checking)
    return (
      <div className="boot">
        <Logo />
        <Loading />
      </div>
    );
  if (authError)
    return (
      <div className="boot">
        <Logo />
        <ErrorState message={authError} retry={check} />
      </div>
    );
  if (!user)
    return (
      <Auth
        onSuccess={(u) => {
          setUser(u);
          setRevision((v) => v + 1);
        }}
      />
    );
  const page =
    location.pathname === '/build'
      ? 'What can I build?'
      : links.find((l) => l.path === location.pathname)?.label || 'Workspace';
  return (
    <AppContext.Provider
      value={{
        user,
        revision,
        refresh: () => setRevision((v) => v + 1),
        notify: setToast,
        addItem: () => setAdd(true),
        logout,
      }}
    >
      <div className="app-shell">
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? 'open' : ''}`}>
          <Link to="/" className="brand-link" aria-label="Stacked Deck overview">
            <Logo />
          </Link>
          <div className="workspace-switch">
            <span className="workspace-icon">A</span>
            <div>
              Personal workspace<span>MAKE SOMETHING YOURS</span>
            </div>
            <ChevronRight size={15} />
          </div>
          <span className="nav-label">WORKSPACE</span>
          <nav>
            {links.map((l) => (
              <NavLink
                key={l.path}
                to={l.path}
                end={l.path === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <l.icon size={18} />
                <span>{l.label}</span>
                {l.path === '/deck' && <span className="nav-key">D</span>}
              </NavLink>
            ))}
            <div className="nav-divider" />
            <NavLink
              to="/build"
              className={({ isActive }) => `nav-link build-nav ${isActive ? 'active' : ''}`}
            >
              <Sparkles size={18} />
              <span>What can I build?</span>
            </NavLink>
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <span className="mini-suit">♧</span>
              <h4>A good hand starts here.</h4>
              <p>That spare hardware could be your next great project.</p>
              <Link to="/build">
                Find your next build <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="user-menu">
              <span className="avatar">
                {user.name
                  .split(' ')
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div>
                <strong>{user.name}</strong>
                <span>Personal account</span>
              </div>
              <button
                className="icon-button"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={20} />
              </button>
              <Layers size={16} />
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{page}</strong>
            </div>
            <div className="topbar-right">
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(`/deck?q=${encodeURIComponent(search)}`);
                }}
              >
                <Search size={15} />
                <input
                  aria-label="Search your deck"
                  placeholder="Find something in your deck…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <span className="topbar-divider" />
              <span className="avatar small-avatar" title={user.name}>
                {user.name[0]}
              </span>
            </div>
          </header>
          <main className="page-content" id="main">
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/deck" element={<InventoryPage />} />
                <Route path="/build" element={<RecommendationsPage />} />
                <Route path="/systems" element={<SystemsPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/locations" element={<LocationsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <footer className="page-footer">
              <span>
                <span className="footer-diamond">◇</span> A place for everything. A possibility in
                every part.
              </span>
              <span>
                STACKED DECK <span className="version">v1.0</span>
              </span>
            </footer>
          </main>
        </div>
      </div>
      {add && <ItemForm onClose={() => setAdd(false)} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
