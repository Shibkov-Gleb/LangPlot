'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  List,
  LockKeyhole,
  RotateCcw,
} from 'lucide-react';
import { CourseResponse, PlayResponse, languageNames, type CourseLesson } from '@langplot/shared';
import { api, errorText } from '@/lib/api';
import { useStudyResource } from '@/lib/use-study-resource';
import { theoryPath } from '@/lib/course-paths';
import { StudyTopicList } from './study-topics';

export function CoursePage({ language, level }: { language: string; level: string }) {
  const {
    data: course,
    error,
    reload,
  } = useStudyResource(
    '/courses/' + encodeURIComponent(language) + '/' + encodeURIComponent(level),
    CourseResponse,
  );
  const router = useRouter();
  const [replaying, setReplaying] = useState<string | null>(null);
  const [replayError, setReplayError] = useState('');
  const lock = useRef(false);
  async function replay(lesson: CourseLesson) {
    if (!lesson.slug || !lesson.replayFrom || lock.current) return;
    lock.current = true;
    setReplaying(lesson.slug);
    setReplayError('');
    try {
      await api('/plays/' + encodeURIComponent(lesson.replayFrom) + '/replay', PlayResponse, {
        method: 'POST',
        body: '{}',
      });
      router.push('/play/' + lesson.slug);
    } catch (e) {
      setReplayError(errorText(e));
      reload();
    } finally {
      lock.current = false;
      setReplaying(null);
    }
  }
  function actions(l: CourseLesson) {
    return l.slug ? (
      <div className="lesson-actions">
        {l.replayFrom ? (
          <button
            className="button primary"
            onClick={() => void replay(l)}
            disabled={replaying !== null}
          >
            <RotateCcw size={15} />
            {replaying === l.slug ? 'Открываем…' : 'Пройти ещё раз'}
          </button>
        ) : (
          <Link className="button primary" href={'/play/' + l.slug}>
            {l.status === 'active' ? 'Продолжить' : 'Начать урок'} <ArrowRight size={15} />
          </Link>
        )}
        {l.theoryOpen ? (
          <Link className="lesson-theory" href={theoryPath(l.slug)}>
            <BookOpen size={15} /> Теория урока
          </Link>
        ) : (
          <span className="lesson-locked">
            <LockKeyhole size={13} /> Теория после прохождения
          </span>
        )}
      </div>
    ) : null;
  }
  const sections = new Map<string, CourseLesson[]>();
  course?.lessons.forEach((lesson) => {
    const title = lesson.section ?? 'Уроки';
    if (!sections.has(title)) sections.set(title, []);
    sections.get(title)!.push(lesson);
  });
  const available = course?.lessons.filter((l) => l.slug).length ?? 0;
  const finished = course?.lessons.filter((l) => l.theoryOpen).length ?? 0;
  return (
    <div className="study-page">
      <Link className="study-back" href="/dashboard">
        <ArrowLeft size={16} /> Мои миры
      </Link>
      {error ? (
        <div className="study-state">
          <p role="alert">{error}</p>
          <button className="button secondary" onClick={reload}>
            Повторить
          </button>
        </div>
      ) : !course ? (
        <p role="status">Открываем курс…</p>
      ) : (
        <>
          <header
            className={
              'course-cover ' +
              (course.language === 'en' && course.level === 'A2'
                ? 'course-cover-alder'
                : 'course-planned')
            }
          >
            <div className="course-cover-copy">
              <span className="study-kicker">
                {languageNames[course.language]} · {course.level}
              </span>
              <h1>{course.title}</h1>
              {course.lessons.length > 0 && (
                <div className="course-counts">
                  <span>
                    <List size={15} /> Уроков в курсе <b>{course.lessons.length}</b>
                  </span>
                  <span>
                    Доступно <b>{available}</b>
                  </span>
                  <span>
                    <Check size={15} /> Пройдено <b>{finished}</b>
                  </span>
                </div>
              )}
            </div>
          </header>
          {course.lessons.length === 0 ? (
            <div className="study-state">
              <BookOpen size={30} />
              <h2>В разработке</h2>
              <p>
                Здесь появятся главы курса «{languageNames[course.language]} · {course.level}».
              </p>
            </div>
          ) : (
            <>
              <div className="study-section-title">
                <h2>Уроки курса</h2>
                <Link href="/dashboard/materials">
                  <BookOpen size={16} /> Мои материалы
                </Link>
              </div>
              {replayError && (
                <p className="error-box" role="alert">
                  {replayError}
                </p>
              )}
              {[...sections].map(([section, lessons], index) => (
                <details
                  className="course-section"
                  key={section}
                  open={index === 0 || lessons.some((l) => l.status === 'active')}
                >
                  <summary>
                    <span>{section}</span>
                    <small>
                      Уроки {lessons[0]?.number}–{lessons.at(-1)?.number}
                    </small>
                    <ChevronDown size={18} />
                  </summary>
                  <ol className="course-lessons" start={lessons[0]?.number}>
                    {lessons.map((l) => (
                      <li
                        value={l.number}
                        key={l.number}
                        className={l.slug ? 'available-lesson' : 'planned-lesson'}
                      >
                        <span className="lesson-num">{String(l.number).padStart(2, '0')}</span>
                        <div className="lesson-info">
                          <h3>
                            {l.routeLessons || l.variants?.length
                              ? 'Два пути расследования'
                              : l.title}
                          </h3>
                          {!l.routeLessons && <StudyTopicList topics={l.topics} />}
                          {l.variants && (
                            <ul className="lesson-variants">
                              {l.variants.map((v) => (
                                <li key={v}>{v}</li>
                              ))}
                            </ul>
                          )}
                          <span className="lesson-status">
                            {l.status === 'planned' ? (
                              <>
                                <Clock3 size={13} /> Готовится
                              </>
                            ) : l.status === 'finished' ? (
                              <>
                                <Check size={14} /> Пройден
                              </>
                            ) : l.status === 'active' ? (
                              l.theoryOpen ? (
                                'Повторное прохождение'
                              ) : (
                                'В процессе'
                              )
                            ) : (
                              'Можно начать'
                            )}
                          </span>
                        </div>
                        {l.routeLessons ? (
                          <div className="course-route-lessons">
                            {l.routeLessons.map((route) => (
                              <div className="course-route" key={route.slug}>
                                <div>
                                  <span>
                                    {route.route === 'D' ? 'Депо с Оуэном' : 'Семьи с Нэлл'}
                                  </span>
                                  <h4>{route.title}</h4>
                                  <StudyTopicList topics={route.topics} />
                                  {route.status === 'finished' && <small>Пройден</small>}
                                </div>
                                {actions(route)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          actions(l)
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
