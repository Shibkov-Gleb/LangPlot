'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, LoaderCircle, Radio, Send, Signal } from 'lucide-react';
import { ChatResponse, MessagesResponse, type Exchange } from '@langplot/shared';
import { api, body, errorText } from '@/lib/api';
interface Props {
  playId: string;
  readOnly: boolean;
  onReady: (ready: boolean) => void;
  contact?: { name: string; role: string; context: string };
}
export function MaePhone({ playId, readOnly, onReady, contact }: Props) {
  const name = contact?.name ?? 'Мэй';
  const [opening, setOpening] = useState(''),
    [messages, setMessages] = useState<Exchange[]>([]),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const lock = useRef(false),
    pending = useRef<{ id: string; text: string } | null>(null),
    log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    setError('');
    onReady(false);
    api('/plays/' + playId + '/messages', MessagesResponse)
      .then((r) => {
        if (!live) return;
        setOpening(r.opening ?? '');
        setMessages(r.messages);
        onReady(r.messages.some((m) => m.status === 'completed'));
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [playId, reload, onReady]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);
  async function send() {
    const value = text.trim();
    if (!value || lock.current || readOnly) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const request =
      pending.current?.text === value ? pending.current : { id: crypto.randomUUID(), text: value };
    pending.current = request;
    try {
      const result = await api('/plays/' + playId + '/messages', ChatResponse, {
        method: 'POST',
        body: body({ requestId: request.id, text: value }),
      });
      setMessages((prev) => [...prev.filter((x) => x.requestId !== request.id), result.exchange]);
      setText('');
      pending.current = null;
      onReady(result.exchange.status === 'completed');
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
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
              {m.text}
              <CheckCheck size={12} />
            </p>
            {m.reply && (
              <p className="lr-bubble incoming" lang="en">
                {m.reply}
              </p>
            )}
          </div>
        ))}
      </div>
      {error && (
        <div className="lr-error" role="alert">
          {error} <button onClick={() => setReload((v) => v + 1)}>Обновить</button>
        </div>
      )}
      {!readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            aria-label={contact ? 'Сообщение — ' + name : 'Сообщение Мэй'}
            lang="en"
            placeholder={contact ? 'Написать сообщение…' : 'Сообщение Мэй…'}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy || !opening}
          />
          <button aria-label="Отправить сообщение" disabled={busy || !text.trim() || !opening}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={17} />}
          </button>
        </form>
      )}
    </section>
  );
}
