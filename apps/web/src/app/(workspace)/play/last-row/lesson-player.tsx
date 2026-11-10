'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Hourglass,
  MapPin,
  MessageCircle,
  NotebookText,
  Radio,
  RotateCcw,
  Ticket,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  PlayResponse,
  ProfileResponse,
  RunList,
  type Play,
  type LessonNote,
} from '@langplot/shared';
import { Brand } from '@/components/brand';
import { Dialog } from '@/components/dialog';
import { useProfile } from '@/components/workspace';
import { api, body, ClientError, errorText } from '@/lib/api';
import { coursePath, theoryPath } from '@/lib/course-paths';
import { MaePhone } from './phone';
import { RichLine, NoteCard, PaperTicket } from './reading';
import { useSceneSound } from './sound';
import { useVoiceover } from './voiceover';

const phases = [
  ['arrival', 'Прибытие'],
  ['dialogue', 'Перекличка'],
  ['grammar', 'Грамматика'],
  ['ticket', 'Билет'],
  ['reading', 'Плакат'],
  ['practice', 'Практика'],
  ['phone', 'Телефон'],
] as const;
const two = (n: number) => String(n).padStart(2, '0');
const chapterPhaseNames: Record<string, string> = {
  arrival: 'Сцена',
  dialogue: 'Диалог',
  ticket: 'Решение',
  reading: 'Документ',
};
type Runs = ReturnType<typeof RunList.parse>['runs'];
export function LessonPlayer({ slug }: { slug: string }) {
  const { user, setUser } = useProfile();
  async function toggleSound() {
    const { name, nativeLanguage, subtitles, reducedMotion } = user;
    const res = await api('/profile', ProfileResponse, {
      method: 'PATCH',
      body: body({ name, nativeLanguage, subtitles, reducedMotion, sound: !user.sound }),
    });
    setUser(res.user);
  }
  return <Player slug={slug} sound={user.sound} toggleSound={toggleSound} />;
}
export function GuestLessonPlayer() {
  const [sound, setSound] = useState(true);
  return (
    <Player slug="last-row" guest sound={sound} toggleSound={() => setSound((value) => !value)} />
  );
}
function Player({
  slug,
  guest = false,
  sound,
  toggleSound,
}: {
  slug: string;
  guest?: boolean;
  sound: boolean;
  toggleSound: () => void | Promise<void>;
}) {
  const [play, setPlay] = useState<Play | null>(null),
    [runs, setRuns] = useState<Runs>([]),
    [course, setCourse] = useState<ReturnType<typeof RunList.parse>['course']>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'journal' | 'ticket' | null>(null),
    [note, setNote] = useState<LessonNote | null>(null),
    [phoneReady, setPhoneReady] = useState(false);
  const lock = useRef(false),
    opener = useRef<HTMLButtonElement | null>(null),
    retry = useRef<{
      playId: string;
      revision: number;
      choiceId: string;
      requestId: string;
    } | null>(null);
  const armSound = useSceneSound(sound, play?.state.sceneId, play?.view?.ambience, play?.view?.cue);
  const { armVoice, replay: repeatSpeech, speechError } = useVoiceover(sound, play?.view?.speech);
  const arm = useCallback(() => {
    armSound();
    armVoice();
  }, [armSound, armVoice]);
  const refreshRuns = useCallback(
    async (selectedId?: string) => {
      const r = await api(
        '/lessons/' +
          encodeURIComponent(slug) +
          '/runs' +
          (selectedId ? '?playId=' + encodeURIComponent(selectedId) : ''),
        RunList,
      );
      setRuns(r.runs);
      setCourse(r.course);
    },
    [slug],
  );
  const openLatest = useCallback(async () => {
    setError('');
    try {
      const res = await api('/lessons/' + encodeURIComponent(slug) + '/plays', PlayResponse, {
        method: 'POST',
        body: '{}',
      });
      setPlay(res.play);
      setPanel(null);
      setNote(null);
      await refreshRuns();
    } catch (e) {
      setError(errorText(e));
    }
  }, [refreshRuns, slug]);
  useEffect(() => {
    void openLatest();
  }, [openLatest]);
  async function changeSound() {
    arm();
    try {
      await toggleSound();
    } catch (e) {
      setError(errorText(e));
    }
  }
  const choose = useCallback(
    async (choiceId: string) => {
      if (!play || lock.current) return;
      lock.current = true;
      setBusy(true);
      setError('');
      setNote(null);
      arm();
      const prior = retry.current;
      const input =
        prior &&
        prior.playId === play.id &&
        prior.choiceId === choiceId &&
        prior.revision === play.revision
          ? prior
          : { playId: play.id, choiceId, revision: play.revision, requestId: crypto.randomUUID() };
      retry.current = input;
      try {
        const result = await api('/plays/' + play.id + '/actions', PlayResponse, {
          method: 'POST',
          body: body({ choiceId, revision: input.revision, requestId: input.requestId }),
        });
        retry.current = null;
        setPlay(result.play);
        if (result.play.view?.layout === 'end') await refreshRuns();
      } catch (e) {
        setError(errorText(e));
        if (e instanceof ClientError && e.code === 'REVISION_CONFLICT') {
          retry.current = null;
          try {
            const r = await api('/plays/' + play.id, PlayResponse);
            setPlay(r.play);
          } catch (err) {
            setError(errorText(err));
          }
        }
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [play, arm, refreshRuns],
  );
  async function replay(review = false) {
    if (!play || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await api('/plays/' + play.id + (review ? '/review' : '/replay'), PlayResponse, {
        method: 'POST',
        body: '{}',
      });
      setPlay(r.play);
      setNote(null);
      setPanel(null);
      setPhoneReady(false);
      retry.current = null;
      await refreshRuns();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function selectRun(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await api('/plays/' + id, PlayResponse);
      setPlay(r.play);
      retry.current = null;
      setNote(null);
      setPanel(null);
      setPhoneReady(false);
      setError('');
      await refreshRuns(id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function showNote(n: LessonNote, el: HTMLButtonElement) {
    opener.current = el;
    setNote(n);
  }
  function closeNote() {
    setNote(null);
    opener.current?.focus();
  }
  const view = play?.view,
    layout = view?.layout;
  const canAdvance =
    view?.choices.length === 1 && !['task', 'choice', 'phone'].includes(layout ?? '');
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (
        !view ||
        panel ||
        note ||
        busy ||
        e.repeat ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        el.closest('input,textarea,select,dialog,[contenteditable]')
      )
        return;
      if ((view.layout === 'task' || view.layout === 'choice') && /^[1-9]$/.test(e.key)) {
        const option = view.choices[Number(e.key) - 1];
        if (option) {
          e.preventDefault();
          void choose(option.id);
        }
        return;
      }
      if (
        canAdvance &&
        (e.key === 'ArrowRight' || (!el.closest('button,a') && [' ', 'Enter'].includes(e.key)))
      ) {
        e.preventDefault();
        void choose(view.choices[0]!.id);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [canAdvance, view, panel, note, busy, choose]);
  const phaseIndex = view ? phases.findIndex((p) => p[0] === view.phase) : -1;
  const historical = !!play && runs.length > 0 && runs[0]?.id !== play.id;
  const gotTicket = play?.state.flags.kept;
  const classic = slug === 'last-row';
  const phaseLabel = (id: string, label: string) =>
    classic ? label : (chapterPhaseNames[id] ?? label);
  const contactName = view?.contact?.name ?? 'Мэй';
  const back = guest ? '/' : course ? coursePath(course.language, course.level) : '/dashboard';
  const theoryOpen = !guest && (layout === 'end' || runs.some((r) => r.finished));
  const showJournal = () => {
    setPanel('journal');
    void refreshRuns().catch((e) => setError(errorText(e)));
  };
  return (
    <div className="lr-page">
      <header className="lr-bar">
        <div className="lr-bar-left">
          <Brand />
          <span className="lr-divider" />
          <Link
            href={back}
            aria-label={guest ? 'На главную' : course ? 'К урокам курса' : 'Мои миры'}
          >
            <ArrowLeft size={15} />
            <span>{guest ? 'На главную' : course ? 'К курсу' : 'Мои миры'}</span>
          </Link>
        </div>
        <div className="lr-bar-right">
          <span className="lr-level" lang="en">
            {course?.language === 'de' ? 'Deutsch' : 'English'} <b>{course?.level}</b>
          </span>
          <button
            className="lr-tool"
            onClick={() => void changeSound()}
            aria-label={sound ? 'Выключить звук' : 'Включить звук'}
            aria-pressed={sound}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="lr-tool lr-journal-button"
            disabled={!play || busy}
            onClick={showJournal}
          >
            <NotebookText size={17} /> Журнал
          </button>
        </div>
      </header>
      {!view || !play ? (
        <div className="lr-loading">
          {error || 'Открываем урок…'}
          {error && <button onClick={() => void openLatest()}>Попробовать снова</button>}
        </div>
      ) : (
        <>
          <section
            className={'lr-stage layout-' + layout + (view.dimLights ? ' lr-last-seat' : '')}
            aria-label="Сцена урока"
            style={{ backgroundImage: 'url("' + view.backdrop + '")' }}
          >
            <div className="lr-shade" />
            {view.portrait && (
              <img
                className="lr-portrait"
                src={view.portrait}
                alt={view.speaker ?? 'Оуэн Керр'}
                key={view.portrait}
              />
            )}
            <div className="lr-topline">
              <span>
                <i /> {course?.title.toUpperCase()}
              </span>
              <span>{course && 'УРОК ' + two(course.number)}</span>
            </div>
            {layout === 'arrival' ? (
              <div className="lr-intro">
                <div className="lr-location">
                  <MapPin size={14} /> {view.presentation?.location ?? 'Олдер-Свитч'} <i />{' '}
                  {view.presentation?.time ?? 'Пятница, вечер'}
                </div>
                <h1>
                  {slug === 'last-row' ? (
                    <>
                      Последний <em>ряд</em>
                    </>
                  ) : (
                    view.title
                  )}
                </h1>
                <p>{view.text}</p>
                <div className="lr-intro-cta">
                  <button
                    className="lr-primary"
                    disabled={busy}
                    onClick={() => void choose(view.choices[0]!.id)}
                  >
                    Войти в историю <ArrowRight size={19} />
                  </button>
                  <span>
                    <Clock3 size={14} /> {view.presentation?.duration ?? '11–13 минут'}
                  </span>
                </div>
              </div>
            ) : layout === 'phone' || layout === 'end' ? (
              <div className="lr-finale">
                <div className="lr-finale-copy">
                  <div className="lr-location">
                    {layout === 'end' ? <Check size={17} /> : <Radio size={17} />}{' '}
                    {layout === 'end' ? 'Урок завершён' : (view.contact?.role ?? 'Диспетчерская')}
                  </div>
                  <h1>
                    {view.postReview
                      ? 'Журнал сверен'
                      : layout === 'end'
                        ? (view.presentation?.finishTitle ?? 'Конец смены')
                        : 'На связи ' + contactName}
                  </h1>
                  <p>
                    {layout === 'end'
                      ? view.text
                      : view.contact
                        ? view.contact.context
                        : gotTicket
                          ? 'Мэй видела билет в вашей руке. Его можно развернуть перед ответом.'
                          : 'Мэй видела, как вы передали билет Оуэну. Он ждёт под красной варежкой.'}
                  </p>
                  {classic && gotTicket && (
                    <button className="lr-subtle" onClick={() => setPanel('ticket')}>
                      <Ticket size={16} /> Посмотреть билет
                    </button>
                  )}
                  {layout === 'phone' ? (
                    <button
                      className="lr-primary"
                      disabled={!phoneReady || busy}
                      onClick={() => void choose('finish')}
                    >
                      Завершить урок <Check size={16} />
                    </button>
                  ) : guest ? (
                    <div className="lr-guest-finish">
                      <p>Создайте аккаунт, чтобы сохранить этот рейс и перейти ко второму уроку.</p>
                      <Link className="lr-primary" href="/login?guest=complete">
                        Сохранить урок и зарегистрироваться <ArrowRight size={16} />
                      </Link>
                      <Link className="lr-subtle" href="/login?guest=complete&mode=login">
                        Уже есть аккаунт? Войти
                      </Link>
                    </div>
                  ) : (
                    <>
                      {course?.nextLesson && (
                        <Link className="lr-primary" href={'/play/' + course.nextLesson.slug}>
                          Следующий урок <ArrowRight size={16} />
                        </Link>
                      )}
                      {course?.number === 90 && (
                        <button
                          className="lr-subtle"
                          disabled={busy}
                          onClick={() => void replay(true)}
                        >
                          <NotebookText size={16} /> Повторить ошибки из журнала
                        </button>
                      )}
                      <button
                        className="lr-primary"
                        disabled={busy}
                        onClick={() => (historical ? void openLatest() : void replay())}
                      >
                        {historical ? 'К текущему прохождению' : 'Пройти ещё раз'}{' '}
                        <RotateCcw size={16} />
                      </button>
                      <Link className="lr-subtle" href={theoryPath(slug)}>
                        <BookOpen size={15} /> Теория урока
                      </Link>
                      <Link className="lr-subtle" href={back}>
                        <ArrowLeft size={15} /> К урокам курса
                      </Link>
                    </>
                  )}
                </div>
                {!view.postReview && (
                  <MaePhone
                    key={play.id}
                    playId={play.id}
                    readOnly={layout === 'end'}
                    onReady={setPhoneReady}
                    contact={view.contact}
                  />
                )}
              </div>
            ) : (
              <div className={'lr-card ' + (layout === 'reading' ? 'lr-reading' : '')}>
                <div className="lr-card-label">
                  {layout === 'reading' ? (
                    <BookOpen size={16} />
                  ) : layout === 'task' ? (
                    <Hourglass size={16} />
                  ) : layout === 'choice' ? (
                    <Ticket size={16} />
                  ) : (
                    <span className="lr-speak-icon" />
                  )}
                  <span>
                    {layout === 'reading'
                      ? classic
                        ? 'Плакат Оуэна'
                        : 'Документ'
                      : layout === 'choice'
                        ? classic
                          ? 'Судьба билета'
                          : 'Решение Льва'
                        : layout === 'task'
                          ? view.phase === 'grammar'
                            ? 'Реплика Льва · Грамматика'
                            : view.taskNumber
                              ? 'Реплика Льва · Лексика'
                              : 'Журнал · Повторение'
                          : (view.speaker ?? 'Олдер-Свитч')}
                  </span>
                  {((classic && view.phase === 'dialogue') ||
                    layout === 'reading' ||
                    view.taskNumber) && (
                    <small>
                      {two(view.taskNumber ?? view.step)} / {two(view.taskTotal ?? view.steps)}
                    </small>
                  )}
                </div>
                {view.speech && (
                  <button
                    className="lr-subtle lr-repeat"
                    onClick={repeatSpeech}
                    disabled={!sound}
                    title={sound ? 'Прослушать реплику ещё раз' : 'Включите звук в верхней панели'}
                  >
                    <Volume2 size={15} /> Повторить реплику
                  </button>
                )}
                {speechError && (
                  <p className="lr-caption" role="status">
                    {speechError}
                  </p>
                )}
                {view.caption && <p className="lr-caption">{view.caption}</p>}
                <p
                  className="lr-speech"
                  lang={layout === 'choice' ? 'ru' : 'en'}
                  aria-live="polite"
                >
                  <RichLine view={view} onNote={showNote} />
                </p>
                {note && <NoteCard note={note} close={closeNote} />}
                {play.state.feedback && (
                  <div className="lr-feedback" role="status">
                    <Radio size={15} />
                    <span>
                      <strong>Подсказка</strong> {play.state.feedback}
                    </span>
                  </div>
                )}
                {layout === 'task' || layout === 'choice' ? (
                  <div className={'lr-options ' + (layout === 'choice' ? 'ticket-options' : '')}>
                    {view.choices.map((c, i) => (
                      <button
                        key={c.id}
                        aria-keyshortcuts={String(i + 1)}
                        disabled={busy}
                        onClick={() => void choose(c.id)}
                      >
                        <small>{two(i + 1)}</small>
                        <span lang="en">{c.label}</span>
                        {layout === 'choice' && <ArrowRight size={16} />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="lr-forward">
                    <span>
                      {view.marks.length > 0 ? (
                        <>
                          <BookOpen size={13} /> Коснитесь подчёркнутой фразы
                        </>
                      ) : null}
                    </span>
                    {view.artifact === 'ticket' && (
                      <button className="lr-subtle" onClick={() => setPanel('ticket')}>
                        <Ticket size={15} /> Билет
                      </button>
                    )}
                    <button
                      className="lr-next"
                      aria-keyshortcuts="ArrowRight"
                      disabled={busy}
                      onClick={() => void choose(view.choices[0]!.id)}
                    >
                      Дальше <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="lr-error lr-stage-error" role="alert">
                {error} <button onClick={() => void openLatest()}>Обновить</button>
              </div>
            )}
          </section>
          <footer className="lr-journey">
            <span>
              <span className="lr-progress-light" />{' '}
              {layout === 'end'
                ? 'Пройдено'
                : phaseLabel(view.phase, phases[phaseIndex]?.[1] ?? '')}
            </span>
            <div aria-label="Ход урока">
              {phases.map(([id, label], i) => (
                <i
                  className={i <= phaseIndex || layout === 'end' ? 'on' : ''}
                  title={phaseLabel(id, label)}
                  key={id}
                />
              ))}
            </div>
            <small>Прохождение {two(play.runNumber)}</small>
          </footer>
        </>
      )}
      {panel === 'ticket' && (
        <Dialog title="Билет Льва" onClose={() => setPanel(null)}>
          <PaperTicket />
        </Dialog>
      )}
      {panel === 'journal' && play && (
        <Dialog title="Журнал" onClose={() => setPanel(null)}>
          <div className="lr-log">
            <h3>{classic ? 'Следы этого рейса' : 'Записи урока'}</h3>
            {play.state.journal.length ? (
              play.state.journal.map((t, i) => <p key={i}>{t}</p>)
            ) : (
              <p>Здесь появится запись о вашем решении.</p>
            )}
            {classic && gotTicket && (
              <button className="lr-log-link" onClick={() => setPanel('ticket')}>
                <Ticket size={16} /> Развернуть билет <ChevronRight size={15} />
              </button>
            )}
            {view?.phoneAvailable && (
              <button
                className="lr-log-link"
                onClick={() => {
                  setPanel(null);
                  requestAnimationFrame(() => document.getElementById('mae-phone')?.focus());
                }}
              >
                <MessageCircle size={16} />{' '}
                {classic ? 'Переписка с Мэй' : 'Переписка — ' + contactName}{' '}
                <ChevronRight size={15} />
              </button>
            )}
            {theoryOpen && (
              <Link className="lr-log-link" href={theoryPath(slug)}>
                <BookOpen size={16} /> Теория урока <ChevronRight size={15} />
              </Link>
            )}
            <h3>Прохождения</h3>
            {runs.map((r) => (
              <button
                className="lr-run"
                key={r.id}
                onClick={() => void selectRun(r.id)}
                disabled={busy || r.id === play.id}
              >
                <span>
                  {classic ? 'Рейс' : 'Попытка'} {two(r.runNumber)}{' '}
                  <small>
                    {!classic
                      ? (r.decision ?? 'Решение ещё не принято')
                      : r.ticket === 'lev'
                        ? 'Билет у Льва'
                        : r.ticket === 'owen'
                          ? 'Билет у Оуэна'
                          : 'До выбора билета'}
                  </small>
                </span>
                <span>{r.finished ? <Check size={16} /> : <ChevronRight size={15} />}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}
