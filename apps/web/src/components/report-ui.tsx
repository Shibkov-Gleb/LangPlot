'use client';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Download, BookOpen } from 'lucide-react';
import { ExportPreview, DAY, moscowDay } from '@langplot/shared';
import { Dialog } from './dialog';
import { api, body, errorText } from '@/lib/api';
const tabs = [
  ['overview', 'Обзор', '/admin'],
  ['lessons', 'Уроки', '/admin/lessons'],
  ['students', 'Ученики', '/admin/students'],
] as const;
export function ReportHeader({ active }: { active: string }) {
  const search = useSearchParams(),
    params = new URLSearchParams();
  for (const k of ['from', 'to', 'variant', 'source']) {
    const v = search.get(k);
    if (v) params.set(k, v);
  }
  return (
    <>
      <header className="crm-heading">
        <div>
          <h1>Администрирование</h1>
          <p>Учебная активность и работа с учениками</p>
        </div>
        <Link className="button secondary" href="/studio">
          <BookOpen size={17} /> Студия контента
        </Link>
      </header>
      <nav aria-label="Отчёты" className="report-tabs">
        {tabs.map(([key, label, url]) => (
          <Link
            key={key}
            href={url + (params.size ? '?' + params : '')}
            aria-current={key === active ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
export function ReportFilters({ sources = [] }: { sources?: string[] }) {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  return (
    <form
      key={params.toString()}
      className="report-filters"
      onSubmit={(e) => {
        e.preventDefault();
        const qs = new URLSearchParams();
        new FormData(e.currentTarget).forEach((v, k) => {
          if (v) qs.set(k, String(v));
        });
        router.push(path + '?' + qs);
      }}
    >
      <label className="field">
        С
        <input
          type="date"
          name="from"
          defaultValue={params.get('from') ?? moscowDay(new Date(Date.now() - 27 * DAY))}
          required
        />
      </label>
      <label className="field">
        По
        <input
          type="date"
          name="to"
          defaultValue={params.get('to') ?? moscowDay(new Date())}
          required
        />
      </label>
      <label className="field">
        Источник
        <input
          name="source"
          list="report-sources"
          placeholder="Все источники"
          defaultValue={params.get('source') ?? ''}
          maxLength={64}
        />
      </label>
      <datalist id="report-sources">
        {sources.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </datalist>
      <label className="field">
        Версия
        <select name="variant" defaultValue={params.get('variant') ?? ''}>
          <option value="">Обе версии</option>
          <option value="original">Исходная</option>
          <option value="first-scene">Пробная сцена</option>
        </select>
      </label>
      <button className="button secondary">Применить</button>
    </form>
  );
}
export function ExportButton({
  type,
  query,
  label,
}: {
  type: string;
  query: string;
  label: string;
}) {
  const [data, set] = useState<ReturnType<typeof ExportPreview.parse>>(),
    [busy, wait] = useState(false),
    [error, setError] = useState('');
  async function prepare() {
    wait(true);
    setError('');
    try {
      set(
        await api('/admin/exports', ExportPreview, {
          method: 'POST',
          body: body({ type, filters: Object.fromEntries(new URLSearchParams(query)) }),
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      wait(false);
    }
  }
  return (
    <div>
      <button className="button secondary" onClick={prepare} disabled={busy}>
        <Download size={16} />
        {busy ? 'Готовим файл…' : label}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <Dialog title={label} onClose={() => set(undefined)}>
          <p>Период · {data.period}</p>
          <p>
            Строк в файле · <b>{data.count}</b>
          </p>
          <p>Столбцы · {data.columns.join(', ')}</p>
          <a
            className="button primary"
            href={'/api/admin/exports/' + data.id}
            download
            onClick={() => setTimeout(() => set(undefined), 200)}
          >
            Скачать CSV
          </a>
        </Dialog>
      )}
    </div>
  );
}
