'use client';
import { useEffect, useRef } from 'react';
import { BookOpen, Clock3, Ticket, X } from 'lucide-react';
import type { LessonNote, LessonView } from '@langplot/shared';

export function RichLine({
  view,
  onNote,
}: {
  view: LessonView;
  onNote: (n: LessonNote, el: HTMLButtonElement) => void;
}) {
  const matches = view.marks
    .flatMap((mark) => {
      const n = view.notes.find((x) => x.key === mark.note);
      if (!n) return [];
      const result: { index: number; span: string; note: LessonNote }[] = [];
      let at = view.text.indexOf(mark.text);
      while (at !== -1) {
        result.push({ index: at, span: mark.text, note: n });
        at = view.text.indexOf(mark.text, at + mark.text.length);
      }
      return result;
    })
    .sort((a, b) => a.index - b.index || b.span.length - a.span.length);
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.index < cursor) continue;
    pieces.push(view.text.slice(cursor, m.index));
    pieces.push(
      <button
        className={'lr-mark ' + (m.note.kind === 'grammar' ? 'is-rule' : '')}
        key={m.index}
        aria-haspopup="dialog"
        onClick={(e) => onNote(m.note, e.currentTarget)}
      >
        {m.span}
      </button>,
    );
    cursor = m.index + m.span.length;
  }
  pieces.push(view.text.slice(cursor));
  return (
    <>
      {pieces.map((p, i) =>
        typeof p === 'string' && p.includes('____') ? (
          <span key={i}>
            {p.split('____')[0]}
            <span className="lr-gap" aria-label="Пропуск">
              …
            </span>
            {p.split('____')[1]}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
export function NoteCard({ note, close }: { note: LessonNote; close: () => void }) {
  const dismiss = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dismiss.current?.focus();
  }, [note]);
  return (
    <div
      className="lr-note"
      role="dialog"
      aria-label={note.kind === 'grammar' ? 'Пояснение грамматики' : 'Перевод слова'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="lr-note-head">
        <span>
          <BookOpen size={15} /> {note.kind === 'grammar' ? 'Грамматика' : 'Перевод'}
        </span>
        <button ref={dismiss} onClick={close} aria-label="Закрыть подсказку">
          <X size={16} />
        </button>
      </div>
      <strong lang="en">{note.title}</strong>
      <p>{note.meaning}</p>
      {note.example && (
        <p className="lr-example" lang="en">
          {note.example}
        </p>
      )}
    </div>
  );
}
export function PaperTicket() {
  return (
    <div className="lr-paper" aria-label="Билет Льва">
      <div className="lr-paper-head">
        <Ticket size={17} /> ALDER SWITCH TRANSIT
      </div>
      <div className="lr-paper-place">Alder Switch</div>
      <div className="lr-paper-caption">PASSENGER TICKET</div>
      <div className="lr-paper-values">
        <span>
          ARRIVAL
          <strong>
            <Clock3 size={14} /> 6:10 PM
          </strong>
        </span>
        <span>
          FARE<strong>$4.00</strong>
        </span>
      </div>
    </div>
  );
}
