'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Search,
  UsersRound,
  BookOpen,
  ListFilter,
} from 'lucide-react';
import { CrmList, CrmMetrics, Role, ContactStage, roleNames, stageNames } from '@langplot/shared';
import { api, errorText } from '@/lib/api';
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value))
    : '—';
export default function AdminPage() {
  const [metrics, setMetrics] = useState<ReturnType<typeof CrmMetrics.parse>>();
  const [list, setList] = useState<ReturnType<typeof CrmList.parse>>();
  const [q, setQ] = useState(''),
    [role, setRole] = useState(''),
    [stage, setStage] = useState(''),
    [due, setDue] = useState(false),
    [page, setPage] = useState(1);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api('/admin/metrics', CrmMetrics, { signal: controller.signal })
      .then(setMetrics)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ search: q, page: String(page) });
      if (role) qs.set('role', role);
      if (stage) qs.set('stage', stage);
      if (due) qs.set('due', 'true');
      api('/admin/users?' + qs, CrmList, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) {
            setList(data);
            setLoading(false);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(errorText(e));
            setLoading(false);
          }
        });
    }, 160);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q, role, stage, due, page, retry]);
  const cards = [
    ['Аккаунты', metrics?.accounts],
    ['С подпиской', metrics?.subscribed],
    ['Входили за 7 дней', metrics?.recentLogins],
    ['Ожидают контакта', metrics?.due],
  ] as const;
  return (
    <div className="crm">
      <header className="crm-heading">
        <div>
          <h1>Администрирование</h1>
          <p>Ученики, обращения и учебный контент.</p>
        </div>
        <Link className="button secondary" href="/studio">
          <BookOpen size={17} /> Студия контента <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="crm-stats">
        {cards.map(([label, val]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{val ?? '—'}</strong>
          </div>
        ))}
      </div>
      <section className="crm-directory">
        <header>
          <div>
            <UsersRound size={19} />
            <h2>Аккаунты</h2>
          </div>
          <span aria-live="polite">
            {loading ? 'Загрузка…' : list ? 'Найдено ' + list.total : ''}
          </span>
        </header>
        <div className="crm-filters">
          <label className="crm-search">
            <Search size={17} />
            <input
              aria-label="Поиск по имени или почте"
              placeholder="Имя или почта"
              value={q}
              maxLength={200}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Уровень доступа"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Все роли</option>
            {Role.options.map((r) => (
              <option key={r} value={r}>
                {roleNames[r]}
              </option>
            ))}
          </select>
          <select
            aria-label="Статус контакта"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Все контакты</option>
            {ContactStage.options.map((s) => (
              <option value={s} key={s}>
                {stageNames[s]}
              </option>
            ))}
          </select>
          <button
            className="crm-due"
            aria-pressed={due}
            onClick={() => {
              setDue(!due);
              setPage(1);
            }}
          >
            <CalendarClock size={16} /> На сегодня
          </button>
        </div>
        {error && (
          <p role="alert" className="error-box">
            {error} <button onClick={() => setRetry((v) => v + 1)}>Повторить</button>
          </p>
        )}
        {!loading && !error && list?.users.length === 0 ? (
          <div className="crm-empty">
            <ListFilter />
            <h3>Аккаунты не найдены</h3>
            <button
              className="button secondary"
              onClick={() => {
                setQ('');
                setRole('');
                setStage('');
                setDue(false);
                setPage(1);
              }}
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="crm-table-scroll">
            <table aria-label="Список аккаунтов" aria-busy={loading}>
              <thead>
                <tr>
                  <th>Имя и почта</th>
                  <th>Доступ</th>
                  <th>Контакт</th>
                  <th>Последний вход</th>
                </tr>
              </thead>
              <tbody>
                {list?.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link className="crm-person" href={'/admin/' + u.id}>
                        <i aria-hidden="true">{u.name[0]}</i>
                        <span>
                          <b>{u.name}</b>
                          <small>{u.email}</small>
                        </span>
                      </Link>
                    </td>
                    <td>{roleNames[u.role]}</td>
                    <td>
                      {stageNames[u.stage]}
                      {u.followUp && <small>{date(u.followUp)}</small>}
                    </td>
                    <td>{date(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && (
          <footer className="crm-pagination">
            <span>
              Страница {page} из {Math.max(1, Math.ceil(list.total / list.pageSize))}
            </span>
            <button
              aria-label="Предыдущая страница"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Следующая страница"
              disabled={page * list.pageSize >= list.total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
