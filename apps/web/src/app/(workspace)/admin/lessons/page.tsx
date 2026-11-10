'use client';
import { useSearchParams } from 'next/navigation';
import { LessonsReport } from '@langplot/shared';
import { useStudyResource } from '@/lib/use-study-resource';
import { ReportHeader, ReportFilters, ExportButton } from '@/components/report-ui';
export default function Lessons() {
  const query = useSearchParams().toString(),
    { data, error, reload } = useStudyResource('/admin/reports/lessons?' + query, LessonsReport);
  return (
    <div className="crm">
      <ReportHeader active="lessons" />
      <ReportFilters />
      {error && (
        <p role="alert">
          {error} <button onClick={reload}>Повторить</button>
        </p>
      )}
      {data ? (
        <>
          <section className="crm-directory">
            <header>
              <h2>Английский A2 · движение по курсу</h2>
            </header>
            <p className="report-note">
              Уникальные ученики с действием в соответствующей попытке. Начало, завершение и переход
              в следующую главу считаются по времени события в выбранном периоде. Повторы —
              отдельные прохождения.
            </p>
            <ExportButton type="lessons" query={query} label="CSV по урокам" />
            <div className="crm-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    {['Урок', 'Начали', 'Завершили', 'Перешли дальше', 'Повторы'].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.lessons.map((l) => (
                    <tr key={l.number}>
                      <th>
                        {l.number}. {l.title}
                      </th>
                      <td>{l.started}</td>
                      <td>{l.finished}</td>
                      <td>{l.continued ?? '—'}</td>
                      <td>{l.replays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="crm-directory">
            <header>
              <h2>Последний ряд · действия по сценам</h2>
            </header>
            <ExportButton type="scenes" query={query} label="CSV по сценам" />
            <div className="crm-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Сцена</th>
                    <th>Ученики</th>
                    <th>Действия</th>
                    <th>Ошибки</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scenes.map((s) => (
                    <tr key={s.id}>
                      <th>
                        {s.id}
                        <small>{s.text}</small>
                      </th>
                      <td>{s.people}</td>
                      <td>{s.actions}</td>
                      <td>{s.mistakes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        !error && <p role="status">Загружаем уроки…</p>
      )}
    </div>
  );
}
