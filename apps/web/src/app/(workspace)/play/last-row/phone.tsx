'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Clock3, LoaderCircle, Radio, Send, Signal } from 'lucide-react';
import { ChatResponse, MessagesResponse, OkResponse, type Exchange } from '@langplot/shared';
import { api, body, errorText } from '@/lib/api';
interface Props {
  playId: string;
  readOnly: boolean;
  onReady: (ready: boolean) => void;
  contact?: { name: string; role: string; context: string };
}
const replyLines = (message: Exchange) =>
  message.replies.length ? message.replies : message.reply ? [message.reply] : [];
const failureText: Record<string, string> = {
  TIMEOUT: 'Собеседник не успел ответить. Попробуйте ещё раз.',
  RATE_LIMITED: 'Собеседник пока занят. Повторите чуть позже.',
  INTERRUPTED: 'Ответ прервался. Можно отправить сообщение повторно.',
  CANCELLED: 'Ожидание остановлено.',
};
export function MaePhone({ playId, readOnly, onReady, contact }: Props) {
  const name = contact?.name ?? 'Мэй';
  const [opening, setOpening] = useState('');
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [revealing, setRevealing] = useState<{ id: string; count: number } | null>(null);
  const lock = useRef(false);
  const request = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = messages.find((m) => m.status === 'pending');
  const typing = busy || !!pending || !!revealing;
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api('/plays/' + playId + '/messages', MessagesResponse, { signal: controller.signal })
      .then((r) => {
        setOpening(r.opening ?? '');
        setMessages(r.messages);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [playId, reload]);
  useEffect(() => () => request.current?.abort(), [playId]);
  useEffect(() => {
    onReady(messages.some((m) => m.status === 'completed'));
  }, [messages, onReady]);
  useEffect(() => {
    if (!pending || busy) return;
    const controller = new AbortController();
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const r = await api('/plays/' + playId + '/messages', MessagesResponse, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setMessages(r.messages);
        const completed = r.messages.find(
          (m) => m.requestId === pending.requestId && m.status === 'completed',
        );
        if (completed) setRevealing({ id: completed.id, count: 0 });
        setError('');
      } catch (e) {
        if (!controller.signal.aborted) setError(errorText(e));
      } finally {
        polling = false;
      }
    }, 1800);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [pending?.requestId, busy, playId]);
  useEffect(() => {
    if (!revealing) return;
    const message = messages.find((m) => m.id === revealing.id);
    const lines = message ? replyLines(message) : [];
    if (revealing.count >= lines.length) {
      setRevealing(null);
      return;
    }
    const reduced =
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reducedMotion === 'true';
    const timer = setTimeout(
      () => setRevealing((current) => (current ? { ...current, count: current.count + 1 } : null)),
      reduced ? 100 : Math.min(900, 250 + (lines[revealing.count]?.length ?? 0) * 7),
    );
    return () => clearTimeout(timer);
  }, [revealing, messages]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, revealing, busy]);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = 'auto';
      input.current.style.height = Math.min(96, input.current.scrollHeight) + 'px';
    }
  }, [text]);
  function update(message: Exchange) {
    setMessages((previous) =>
      previous.some((m) => m.requestId === message.requestId)
        ? previous.map((m) => (m.requestId === message.requestId ? message : m))
        : [...previous, message],
    );
  }
  async function send(previous?: Exchange) {
    const value = (previous?.text ?? text).trim();
    if (!value || lock.current || typing || readOnly) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    const message: Exchange = {
      id: previous?.id ?? crypto.randomUUID(),
      requestId: previous?.requestId ?? crypto.randomUUID(),
      text: value,
      reply: null,
      replies: [],
      status: 'pending',
      errorCode: null,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
    };
    update(message);
    if (!previous) setText('');
    try {
      const result = await api('/plays/' + playId + '/messages', ChatResponse, {
        method: 'POST',
        body: body({ requestId: message.requestId, text: value }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      update(result.exchange);
      if (result.exchange.status === 'completed')
        setRevealing({ id: result.exchange.id, count: 0 });
    } catch (e) {
      if (!controller.signal.aborted) {
        update({ ...message, status: 'failed', errorCode: 'NETWORK_ERROR' });
        setError(errorText(e));
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function cancel() {
    if (!pending) return;
    try {
      await api('/plays/' + playId + '/messages/' + pending.requestId + '/cancel', OkResponse, {
        method: 'POST',
        body: '{}',
      });
      request.current?.abort();
      const current = await api('/plays/' + playId + '/messages', MessagesResponse);
      setMessages(current.messages);
      const completed = current.messages.find(
        (m) => m.requestId === pending.requestId && m.status === 'completed',
      );
      if (completed) setRevealing({ id: completed.id, count: 0 });
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="lr-phone" id="mae-phone" tabIndex={-1} aria-label={'Телефон ' + name}>
      <div className="lr-phone-status">
        <span>ALDER SWITCH</span>
        <Signal size={13} />
      </div>
      <header>
        <span className="lr-avatar">
          <Radio size={23} />
        </span>
        <div>
          <strong>{contact?.name ?? 'Мэй Роу'}</strong>
          <small>{contact?.role ?? 'Диспетчерская'}</small>
        </div>
      </header>
      <div
        ref={log}
        className="lr-thread"
        role="log"
        aria-live="polite"
        aria-label={contact ? 'Переписка — ' + name : 'Переписка с Мэй'}
      >
        {opening && (
          <p className="lr-bubble incoming" lang="en">
            {opening}
          </p>
        )}
        {!opening && !error && <LoaderCircle size={18} className="spin" />}
        {messages.map((m) => (
          <div key={m.id}>
            <p className="lr-bubble outgoing" lang="en">
              <span>{m.text}</span>
              <span className="lr-message-meta">
                <time dateTime={m.createdAt}>
                  {new Date(m.createdAt).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                {m.status === 'completed' ? (
                  <CheckCheck size={12} aria-label="Доставлено" />
                ) : m.status === 'pending' ? (
                  <Clock3 size={11} aria-label="Ожидание ответа" />
                ) : null}
              </span>
            </p>
            {replyLines(m)
              .slice(0, revealing?.id === m.id ? revealing.count : undefined)
              .map((line, i) => (
                <p className="lr-bubble incoming" key={i} lang="en">
                  {line}
                </p>
              ))}
            {(m.status === 'failed' || m.status === 'cancelled') && (
              <div className="lr-message-failure">
                <span>{failureText[m.errorCode ?? ''] ?? 'Не удалось получить ответ.'}</span>
                {!readOnly && (
                  <button type="button" disabled={typing} onClick={() => void send(m)}>
                    Повторить отправку
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="lr-typing" role="status" aria-label={name + ' печатает'}>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      {error && (
        <div className="lr-error" role="alert">
          {error} <button onClick={() => setReload((v) => v + 1)}>Обновить</button>
        </div>
      )}
      {!readOnly && (
        <>
          {pending && (
            <button className="lr-stop-reply" type="button" onClick={() => void cancel()}>
              Остановить ожидание
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={input}
              rows={1}
              aria-label={contact ? 'Сообщение — ' + name : 'Сообщение Мэй'}
              lang="en"
              placeholder="Написать сообщение…"
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={!opening}
            />
            <button aria-label="Отправить сообщение" disabled={typing || !text.trim() || !opening}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={17} />}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
