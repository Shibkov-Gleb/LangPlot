'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  Compass,
  ChartNoAxesCombined,
  Settings2,
  FlaskConical,
  LogOut,
  LoaderCircle,
  ArrowUpRight,
} from 'lucide-react';
import { OkResponse, Profile, SessionResponse } from '@langplot/shared';
import { api, errorText } from '@/lib/api';
import { studyReturnPath } from '@/lib/course-paths';
import { Brand } from './brand';
const Context = createContext<{
  user: Profile;
  setUser: (user: Profile) => void;
  localMode: boolean;
} | null>(null);
export function useProfile() {
  const value = useContext(Context);
  if (!value) throw new Error('Profile provider required');
  return value;
}
const nav = [
  { href: '/dashboard', text: 'Мои миры', icon: Compass },
  { href: '/dashboard/progress', text: 'Прогресс', icon: ChartNoAxesCombined },
  { href: '/dashboard/materials', text: 'Материалы', icon: BookOpen },
  { href: '/dashboard/settings', text: 'Настройки', icon: Settings2 },
];
export function Workspace({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [error, setError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const pathname = usePathname();
  const lessonPlayer = /^\/play\/[a-z][a-z0-9-]*$/.test(pathname);
  const gamePlayer = pathname === '/play' || lessonPlayer;
  const activeNav = pathname.startsWith('/courses/')
    ? '/dashboard'
    : pathname.startsWith('/dashboard/materials/')
      ? '/dashboard/materials'
      : pathname;
  const router = useRouter();
  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api('/session', SessionResponse);
      if (!result.user) {
        const target = studyReturnPath(pathname);
        router.replace(
          pathname === '/play/last-row'
            ? '/login?lesson=last-row'
            : target
              ? '/login?next=' + encodeURIComponent(target)
              : '/login',
        );
        return;
      }
      setUser(result.user);
      setLocalMode(result.localMode);
    } catch (e) {
      setError(errorText(e));
    }
  }, [router, pathname]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(user?.reducedMotion ?? false);
    return () => {
      delete document.documentElement.dataset.reducedMotion;
    };
  }, [user?.reducedMotion]);
  async function logout() {
    setLogoutPending(true);
    try {
      await api('/session', OkResponse, { method: 'DELETE', body: '{}' });
      router.push('/');
    } catch (e) {
      setError(errorText(e));
      setLogoutPending(false);
    }
  }
  if (!user)
    return (
      <main id="main" className="standalone-state">
        <Brand />
        {error ? (
          <>
            <p className="error-box" role="alert">
              {error}
            </p>
            <button className="button secondary" onClick={load}>
              Повторить
            </button>
            <Link href="/">На главную</Link>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={24} />
            <p>Открываем ваши миры…</p>
          </>
        )}
      </main>
    );
  return (
    <Context.Provider value={{ user, setUser, localMode }}>
      <div
        className={`workspace ${gamePlayer ? 'workspace-game' : ''} ${lessonPlayer ? 'workspace-lesson' : ''}`}
      >
        <aside className="sidebar">
          <Brand />
          <div className="sidebar-caption">ВАШЕ ПРОСТРАНСТВО</div>
          <nav aria-label="Личный кабинет">
            {nav.map(({ href, text, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={text}
                title={text}
                className={activeNav === href ? 'active' : ''}
                aria-current={
                  activeNav === href ? (pathname === href ? 'page' : 'location') : undefined
                }
              >
                <Icon size={19} />
                <span>{text}</span>
                {activeNav === href && <i />}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            {localMode && (
              <Link
                href="/studio"
                className={pathname === '/studio' ? 'studio-link active' : 'studio-link'}
              >
                <FlaskConical size={17} /> Студия контента <ArrowUpRight size={14} />
              </Link>
            )}
            <div className="sidebar-note">
              <span className="live-dot" />
              <div>
                Начало большой истории<p>Локальная демоверсия</p>
              </div>
            </div>
          </div>
        </aside>
        <div className="workspace-main">
          <header className="workspace-header">
            <span className="breadcrumb">
              {pathname === '/studio'
                ? 'Студия контента'
                : gamePlayer
                  ? 'Игровое пространство'
                  : 'Личный кабинет'}{' '}
              <span>/ {nav.find((x) => x.href === activeNav)?.text ?? 'Локальная версия'}</span>
            </span>
            <div className="workspace-account">
              {localMode && (
                <Link className="mobile-studio-link" href="/studio" aria-label="Открыть студию">
                  <FlaskConical size={17} />
                </Link>
              )}
              <span className="demo-badge">ДЕМО</span>
              <span className="avatar">{user.name[0]?.toUpperCase()}</span>
              <span className="account-name">{user.name}</span>
              <button aria-label="Выйти" title="Выйти" onClick={logout} disabled={logoutPending}>
                <LogOut size={17} />
              </button>
            </div>
          </header>
          {error && (
            <p className="error-box workspace-error" role="alert">
              {error}
            </p>
          )}
          <main id="main" className={gamePlayer ? 'player-main' : 'dashboard-content'}>
            {children}
          </main>
        </div>
      </div>
    </Context.Provider>
  );
}
