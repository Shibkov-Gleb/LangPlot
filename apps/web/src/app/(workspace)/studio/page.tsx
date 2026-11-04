'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  FileJson,
  FlaskConical,
  LoaderCircle,
  Play,
  RotateCw,
  Upload,
  AlertCircle,
} from 'lucide-react';
import {
  ImportResponse,
  IntegrationsResponse,
  Job,
  JobResponse,
  JobsResponse,
  ValidationReport,
  levels,
  languageNames,
} from '@langplot/shared';
import { api, body, errorText } from '@/lib/api';
import { useProfile } from '@/components/workspace';
const stages = [
  ['brief', 'Задание'],
  ['structure', 'Структура'],
  ['validation', 'Проверка'],
  ['report', 'Отчёт'],
  ['export', 'Экспорт'],
];
export default function StudioPage() {
  const { localMode } = useProfile();
  const [brief, setBrief] = useState('');
  const [language, setLanguage] = useState<'en' | 'de'>('en');
  const [level, setLevel] = useState('A1');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<
    { name: string; status: string; detail: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [imported, setImported] = useState<unknown>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      const result = await api('/studio/jobs', JobsResponse);
      setJobs(result.jobs);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    if (!localMode) return;
    void load();
    api('/studio/integrations', IntegrationsResponse)
      .then((r) => setIntegrations(r.integrations))
      .catch((e) => setError(errorText(e)));
  }, [load, localMode]);
  const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void load();
    }, 1000);
    return () => clearInterval(timer);
  }, [active, load]);
  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0];
  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api('/studio/jobs', JobResponse, {
        method: 'POST',
        body: body({ brief, language, level }),
      });
      setSelectedId(result.job.id);
      setJobs((old) => [result.job, ...old]);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/studio/jobs/${id}/retry`, JobResponse, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setNotice('');
    setReport(null);
    setImported(null);
    setFileName(file.name);
    try {
      if (!file.name.toLowerCase().endsWith('.json'))
        throw new Error('Выберите файл .json. Архивы и скрипты не принимаются.');
      if (file.size > 1024 * 1024) throw new Error('Размер пакета должен быть меньше 1 МБ.');
      const value: unknown = JSON.parse(await file.text());
      const result = await api('/studio/validate', ValidationReport, {
        method: 'POST',
        body: body(value),
      });
      setImported(value);
      setReport(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function importFile() {
    if (!report?.valid || !imported) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/studio/import', ImportResponse, {
        method: 'POST',
        body: body(imported),
      });
      setReport(result.report);
      setNotice('Черновик импортирован как отдельная версия пакета.');
      setImported(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!localMode)
    return (
      <div className="empty-panel">
        <h1>Студия недоступна.</h1>
        <p>Этот раздел открывается только в локальном режиме.</p>
      </div>
    );
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow muted">LANGPLOT / РАБОЧЕЕ ПРОСТРАНСТВО</div>
          <h1>
            Студия контента<span>.</span>
          </h1>
          <p>От задания к проверяемому пакету будущей истории.</p>
        </div>
        <span className="outlined-icon">
          <FlaskConical size={25} />
        </span>
      </div>
      <div className="studio-notice">
        <FlaskConical size={19} />
        <p>
          Локальный тестовый граф{' '}
          <span>Создаёт пустой каркас. Модели, озвучка и публикация ещё не подключены.</span>
        </p>
      </div>
      {error && (
        <p className="error-box studio-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-box studio-alert" role="status">
          {notice}
        </p>
      )}
      <div className="studio-grid">
        <form className="panel studio-form" onSubmit={run}>
          <div className="panel-heading">
            <FileJson size={20} />
            <h2>Новое задание</h2>
          </div>
          <label className="field">
            Что нужно подготовить?
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              required
              minLength={10}
              maxLength={4000}
              placeholder="Опишите цель будущего пакета. Например: каркас первой части для знакомства с языком."
            />
            <small>Описание сохранится в метаданных черновика.</small>
          </label>
          <div className="form-row">
            <label className="field">
              Язык
              <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'de')}>
                <option value="en">Английский</option>
                <option value="de">Немецкий</option>
              </select>
            </label>
            <label className="field">
              Уровень
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {levels.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <button disabled={busy || brief.trim().length < 10} className="button primary full">
            {busy ? <LoaderCircle size={17} className="spin" /> : <Play size={17} />}Подготовить
            черновик
          </button>
          <p className="small muted-text studio-help">
            LangGraph: задание → структура → проверка → отчёт → экспорт.
          </p>
        </form>
        <section className="panel studio-result">
          <div className="panel-heading">
            <h2>Результат подготовки</h2>
            {selected && (
              <span className={`job-status ${selected.status}`}>{statusName(selected.status)}</span>
            )}
          </div>
          {!selected ? (
            <div className="studio-empty">
              <FileJson size={34} />
              <h3>Здесь появится первый черновик</h3>
              <p>
                Заполните задание и запустите граф.
                <br />
                Все этапы сохраняются в базе.
              </p>
            </div>
          ) : (
            <>
              <div className="graph-steps">
                {stages.map(([key, label], i) => {
                  const complete =
                    selected.status === 'completed' ||
                    stages.findIndex((x) => x[0] === selected.stage) > i;
                  return (
                    <div
                      className={complete ? 'complete' : selected.stage === key ? 'current' : ''}
                      key={key}
                    >
                      <span>{complete ? <Check size={12} /> : i + 1}</span>
                      <small>{label}</small>
                    </div>
                  );
                })}
              </div>
              <div className="result-summary">
                <span>
                  {languageNames[selected.language]} · {selected.level}
                </span>
                <p>{selected.brief}</p>
              </div>
              {selected.report && <Report report={selected.report} />}{' '}
              {selected.error && <p className="error-box">{selected.error}</p>}
              {selected.status === 'completed' && (
                <>
                  <a
                    className="button secondary full"
                    href={`/api/studio/jobs/${selected.id}/export`}
                    download
                  >
                    <ArrowDownToLine size={17} /> Скачать пакет JSON
                  </a>
                  <details className="json-details">
                    <summary>Посмотреть структуру пакета</summary>
                    <pre>{JSON.stringify(selected.output, null, 2)}</pre>
                  </details>
                </>
              )}
              {['failed', 'interrupted'].includes(selected.status) && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => retry(selected.id)}
                >
                  <RotateCw size={16} /> Запустить повторно
                </button>
              )}
            </>
          )}
        </section>
      </div>
      <div className="studio-lower">
        <section className="panel">
          <div className="panel-heading">
            <Upload size={19} />
            <h2>Импорт локального пакета</h2>
          </div>
          <p className="panel-description">
            Пакет из локальной работы через Codex проходит ту же проверку, что и результат графа.
          </p>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            aria-label="Выбрать пакет JSON"
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
            }}
          />
          <button className="upload-area" onClick={() => fileRef.current?.click()}>
            <FileJson size={23} />
            <strong>{fileName || 'Выбрать JSON-файл'}</strong>
            <span>До 1 МБ · Декларативный формат пакета</span>
          </button>
          {report && <Report report={report} />}
          <button
            className="button secondary full"
            disabled={!report?.valid || !imported || busy}
            onClick={importFile}
          >
            Импортировать как черновик
          </button>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>История заданий</h2>
            <button className="icon-button" aria-label="Обновить задания" onClick={load}>
              <RotateCw size={15} />
            </button>
          </div>
          {!jobs.length ? (
            <p className="panel-description">Заданий пока нет. Первый запуск появится здесь.</p>
          ) : (
            <div className="job-list">
              {jobs.map((job) => (
                <button
                  onClick={() => setSelectedId(job.id)}
                  className={selected?.id === job.id ? 'active' : ''}
                  key={job.id}
                >
                  <FileJson size={18} />
                  <span>
                    <strong>{job.brief}</strong>
                    <small>
                      {job.language.toUpperCase()} / {job.level} ·{' '}
                      {new Date(job.createdAt).toLocaleDateString('ru')}
                    </small>
                  </span>
                  <span className="job-status">{statusName(job.status)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="integrations">
        <div className="section-label">
          <h2>
            Подключения <span>Готовы к следующему этапу</span>
          </h2>
        </div>
        <div>
          {integrations.map((item) => (
            <article key={item.name}>
              <span className="integration-dot" />
              <h3>{item.name}</h3>
              <strong>{item.status}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
function statusName(status: string) {
  return (
    (
      {
        queued: 'В очереди',
        running: 'В работе',
        completed: 'Готово',
        failed: 'Ошибка',
        interrupted: 'Прервано',
      } as Record<string, string>
    )[status] ?? status
  );
}
function Report({ report }: { report: ValidationReport }) {
  return (
    <div className={`validation-report ${report.valid ? 'valid' : 'invalid'}`}>
      <strong>
        {report.valid ? <Check size={15} /> : <AlertCircle size={15} />}{' '}
        {report.valid ? 'Формат пакета корректен' : 'Пакет не прошёл проверку'}
      </strong>
      {report.errors.map((error, i) => (
        <p key={i}>{error}</p>
      ))}
      {report.warnings.map((warning, i) => (
        <p key={i}>{warning}</p>
      ))}
      <span>
        {report.publishable
          ? 'Контент заполнен. Публикация пока не подключена.'
          : 'Статус: черновик, не готов к публикации.'}
      </span>
    </div>
  );
}
