'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, MessageSquare, ShieldCheck } from 'lucide-react';
import {
  ContactStage,
  CrmDetail,
  OkResponse,
  roleNames,
  stageNames,
  languageNames,
} from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { Dialog } from '@/components/dialog';
import { api, body, errorText } from '@/lib/api';
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('ru-RU') : '—');
export default function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const backQuery = useSearchParams().toString();
  const { id } = use(params),
    { user: viewer } = useProfile(),
    path = '/admin/users/' + encodeURIComponent(id);
  const [data, setData] = useState<CrmDetail>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [stage, setStage] = useState<ContactStageValue>('NEW'),
    [followUp, setFollowUp] = useState(''),
    [note, setNote] = useState('');
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(undefined);
    setError('');
    api(path, CrmDetail, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) {
          setData(d);
          setStage(d.user.stage);
          setFollowUp(d.user.followUp ?? '');
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [path, retry]);
  async function save(action: 'notes' | 'contact' | 'role', input: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    setConfirm(false);
    try {
      await api(path + '/' + action, OkResponse, {
        method: action === 'notes' ? 'POST' : 'PATCH',
        body: body(input),
      });
      if (action === 'notes') setNote('');
      const refreshed = await api(path, CrmDetail);
      setData(refreshed);
      setMessage(
        action === 'notes'
          ? 'Заметка добавлена.'
          : action === 'role'
            ? 'Права обновлены.'
            : 'Контакт сохранён.',
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const u = data?.user;
  return (
    <div className="crm">
      <Link className="study-back" href={'/admin/students' + (backQuery ? '?' + backQuery : '')}>
        <ArrowLeft size={16} /> К списку аккаунтов
      </Link>
      {error && (
        <p role="alert" className="error-box">
          {error} {!data && <button onClick={() => setRetry((v) => v + 1)}>Повторить</button>}
        </p>
      )}
      {message && (
        <p role="status" className="success-box">
          {message}
        </p>
      )}
      {!data || !u ? (
        !error && <p role="status">Открываем карточку…</p>
      ) : (
        <>
          <header className="crm-heading">
            <div>
              <h1>{u.name}</h1>
              <p>{u.email}</p>
            </div>
            <span className="crm-pill">{roleNames[u.role]}</span>
          </header>
          <div className="crm-pair">
            <section className="panel crm-panel">
              <h2>Профиль</h2>
              <dl>
                <dt>Регистрация</dt>
                <dd>{date(u.createdAt)}</dd>
                <dt>Последний вход</dt>
                <dd>{date(u.lastLoginAt)}</dd>
                <dt>Выбранный курс</dt>
                <dd>
                  {languageNames[u.language]} · {u.level}
                </dd>
                <dt>Прохождения / учебные попытки</dt>
                <dd>
                  {data.runs} / {data.attempts}
                </dd>
              </dl>
              {viewer.role === 'SUPERADMIN' && u.role !== 'SUPERADMIN' && (
                <button
                  disabled={busy}
                  className="button secondary"
                  onClick={() => setConfirm(true)}
                >
                  <ShieldCheck size={16} />
                  {u.role === 'ADMIN' ? 'Снять права администратора' : 'Назначить администратором'}
                </button>
              )}
            </section>
            <form
              className="panel crm-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void save('contact', { stage, followUp: followUp || null });
              }}
            >
              <h2>
                <CalendarClock size={18} /> Работа с контактом
              </h2>
              <label className="field">
                Статус контакта
                <select
                  value={stage}
                  onChange={(e) => setStage(ContactStage.parse(e.target.value))}
                >
                  {ContactStage.options.map((s) => (
                    <option key={s} value={s}>
                      {stageNames[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Следующий контакт
                <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              </label>
              <button disabled={busy} className="button secondary">
                Сохранить контакт
              </button>
            </form>
          </div>
          <div className="crm-pair">
            <section className="panel crm-panel">
              <h2>
                <MessageSquare size={18} /> История контакта
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save('notes', { text: note });
                }}
              >
                <label className="field">
                  Внутренняя заметка
                  <textarea
                    rows={3}
                    value={note}
                    maxLength={1500}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Что обсудили с учеником?"
                  />
                </label>
                <button disabled={busy || !note.trim()} className="button primary">
                  Добавить заметку
                </button>
              </form>
              {data.history.length ? (
                <ul className="crm-timeline">
                  {data.history.map((e) => (
                    <li key={e.id}>
                      <small>
                        {e.author} · {new Date(e.createdAt).toLocaleString('ru-RU')}
                      </small>
                      <p>{e.text}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Записей пока нет.</p>
              )}
            </section>
            <section className="panel crm-panel">
              <h2>Последние занятия</h2>
              {data.lessons.length ? (
                <ul className="crm-timeline">
                  {data.lessons.map((l) => (
                    <li key={l.id}>
                      <small>{date(l.updatedAt)}</small>
                      <p>{l.title}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Ученик ещё не открывал уроки.</p>
              )}
            </section>
          </div>
          {confirm && (
            <Dialog title="Изменить права доступа?" onClose={() => setConfirm(false)}>
              <p>
                {u.email}{' '}
                {u.role === 'ADMIN'
                  ? 'потеряет доступ к CRM и студии контента.'
                  : 'получит доступ к CRM и созданию контента.'}
              </p>
              <div className="crm-actions">
                <button
                  className="button primary"
                  onClick={() => void save('role', { admin: u.role !== 'ADMIN' })}
                >
                  Подтвердить
                </button>
                <button className="button secondary" onClick={() => setConfirm(false)}>
                  Отмена
                </button>
              </div>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
type ContactStageValue = (typeof ContactStage.options)[number];
