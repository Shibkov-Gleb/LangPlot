'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Overview } from '@langplot/shared';
import { useStudyResource } from '@/lib/use-study-resource';
import { ReportHeader, ReportFilters, ExportButton } from '@/components/report-ui';
const percent = (a: number, b: number) =>
  b ? ((100 * a) / b).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%' : '—';
export default function AdminPage() {
  const query = useSearchParams().toString(),
    { data, error, reload } = useStudyResource('/admin/reports/overview?' + query, Overview);
  return (
    <div className="crm">
      <ReportHeader active="overview" />
      <ReportFilters sources={data?.sources} />
      {error && (
        <p role="alert">
          {error} <button onClick={reload}>Повторить</button>
        </p>
      )}
      {data ? (
        <>
          <section className="crm-directory">
            <header>
              <h2>От первого посещения до оплаты</h2>
            </header>
            <p className="report-note">
              Когорты по первому посещению · {data.from} — {data.to} · МСК. Учёт посещений с{' '}
              {new Date(data.trackingSince).toLocaleDateString('ru-RU', {
                timeZone: 'Europe/Moscow',
              })}
              . За более ранние даты данных о посещениях нет.
            </p>
            <div className="crm-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Показатель</th>
                    <th>Участники / база</th>
                    <th>Доля</th>
                    <th>Предыдущий период</th>
                  </tr>
                </thead>
                <tbody>
                  {data.metrics.map((m, i) => {
                    const trackingDay = new Date(data.trackingSince).toLocaleDateString('sv-SE', {
                      timeZone: 'Europe/Moscow',
                    });
                    const prev = data.previous[i]!,
                      qs = new URLSearchParams(query);
                    qs.set('from', data.from);
                    qs.set('to', data.to);
                    qs.set('segment', m.key);
                    return (
                      <tr key={m.key}>
                        <th>
                          {['registered', 'completed7'].includes(m.key) ? (
                            <Link href={'/admin/students?' + qs}>{m.label} ↗</Link>
                          ) : (
                            m.label
                          )}
                        </th>
                        {data.to < trackingDay ? (
                          <td colSpan={3}>Нет данных до начала учёта</td>
                        ) : !m.enabled ? (
                          <td colSpan={3}>Данные об оплатах ещё не собираются</td>
                        ) : (
                          <>
                            <td>
                              {m.count} из {m.base}
                              {m.pending > 0 && (
                                <small>Окно наблюдения открыто · {m.pending}</small>
                              )}
                            </td>
                            <td>{percent(m.count, m.base)}</td>
                            <td>
                              {data.previousTo < trackingDay
                                ? 'Нет данных'
                                : prev.count +
                                  ' из ' +
                                  prev.base +
                                  ' · ' +
                                  percent(prev.count, prev.base)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="report-note">
              Сравнение · {data.previousFrom} — {data.previousTo}. База — новые посетители периода.
              Для D1/D7 учитываются завершённые календарные дни, для конверсии за 7/30 дней — полные
              окна. Последняя строка использует базу завершивших урок за 30 дней.
            </p>
          </section>
          <ExportButton type="cohorts" query={query} label="CSV по когортам" />
        </>
      ) : (
        !error && <p role="status">Загружаем воронку…</p>
      )}
    </div>
  );
}
