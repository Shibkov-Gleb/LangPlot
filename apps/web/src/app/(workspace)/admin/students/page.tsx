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
import { ReportHeader, ExportButton } from '@/components/report-ui';
import { useSearchParams } from 'next/navigation';
import { useProfile } from '@/components/workspace';
export default function StudentsPage() {
  const [metrics, setMetrics] = useState<ReturnType<typeof CrmMetrics.parse>>();
  const [list, setList] = useState<ReturnType<typeof CrmList.parse>>();
  const incoming = useSearchParams();
  const [q, setQ] = useState(incoming.get('search') ?? ''),
    [role, setRole] = useState(incoming.get('role') ?? ''),
    [stage, setStage] = useState(incoming.get('stage') ?? ''),
    [due, setDue] = useState(incoming.get('due') === 'true'),
    [page, setPage] = useState(Math.max(1, Number(incoming.get('page')) || 1)),
    [segment, setSegment] = useState(incoming.get('segment') ?? '');
  const { user } = useProfile();
  const qs = new URLSearchParams();
  for (const key of ['from', 'to', 'source', 'variant']) {
    const value = incoming.get(key);
    if (value) qs.set(key, value);
  }
  if (q) qs.set('search', q);
  if (role) qs.set('role', role);
  if (stage) qs.set('stage', stage);
  if (due) qs.set('due', 'true');
  if (segment) qs.set('segment', segment);
  if (page > 1) qs.set('page', String(page));
  const query = qs.toString();
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
      window.history.replaceState(null, '', '/admin/students' + (query ? '?' + query : ''));
      api('/admin/users?' + query, CrmList, { signal: controller.signal })
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
  }, [query, retry]);
  const cards = [
    ['Аккаунты', metrics?.accounts],
    ['С подпиской', metrics?.subscribed],
    ['Входили за 7 дней', metrics?.recentLogins],
    ['Ожидают контакта', metrics?.due],
  ] as const;
  return (
    <div className="crm">
      <ReportHeader active="students" />
      <div className="crm-stats">
        {cards.map(([label, val]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{val ?? '—'}</strong>
          </div>
        ))}
      </div>
      <div className="report-exports">
        <ExportButton type="students" query={query} label="CSV сегмента" />
        {user.role === 'SUPERADMIN' && (
          <ExportButton type="contacts" query={query} label="CSV с контактами" />
        )}
      </div>
      {(incoming.has('from') || incoming.has('source') || incoming.has('variant')) && (
        <p>
          Фильтры отчёта ·{' '}
          {[
            incoming.get('from'),
            incoming.get('to'),
            incoming.get('source'),
            incoming.get('variant'),
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          <Link
            href="/admin/students"
            onClick={() => {
              setSegment('');
              setPage(1);
            }}
          >
            Очистить период и источник
          </Link>
        </p>
      )}
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
          <select
            aria-label="Учебный сегмент"
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Все ученики и сотрудники</option>
            <option value="not-started">Зарегистрировался, но не начал</option>
            <option value="stalled">Не завершил за 48 часов</option>
            <option value="completed">Завершил первый урок</option>
            <option value="registered">Регистрации из воронки</option>
            <option value="completed7">Завершил за 7 дней</option>
          </select>
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
                window.history.replaceState(null, '', '/admin/students');
                setSegment('');
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
                      <Link
                        className="crm-person"
                        href={'/admin/' + u.id + (query ? '?' + query : '')}
                      >
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
