'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Languages } from 'lucide-react';
import { TheoryResponse, languageNames } from '@langplot/shared';
import { coursePath } from '@/lib/course-paths';
import { useStudyResource } from '@/lib/use-study-resource';
import { GrammarArticle } from './grammar-article';
import { StudyTopicList } from './study-topics';
export function TheoryPage({ slug }: { slug: string }) {
  const {
    data: lesson,
    error,
    errorCode,
    reload,
  } = useStudyResource('/lessons/' + encodeURIComponent(slug) + '/theory', TheoryResponse);
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    if (lesson && (anchor === 'grammar' || anchor === 'vocabulary'))
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'instant' });
  }, [lesson]);
  return (
    <article className="study-page theory-page">
      <Link className="study-back" href="/dashboard/materials">
        <ArrowLeft size={16} /> Все материалы
      </Link>
      {error ? (
        <div className="study-state">
          <BookOpen size={30} />
          <h1>Теория урока</h1>
          <p role="alert">{error}</p>
          {errorCode === 'THEORY_LOCKED' ? (
            <Link href={'/play/' + encodeURIComponent(slug)} className="button primary">
              Открыть урок <ArrowRight size={15} />
            </Link>
          ) : (
            <button className="button secondary" onClick={reload}>
              Повторить
            </button>
          )}
          <Link href="/dashboard">
            К моим мирам <ArrowRight size={15} />
          </Link>
        </div>
      ) : !lesson ? (
        <p role="status">Открываем теорию…</p>
      ) : (
        <>
          <header className="theory-heading">
            <Link className="study-kicker" href={coursePath(lesson.language, lesson.level)}>
              {languageNames[lesson.language]} · {lesson.level} <span>/ {lesson.title}</span>
            </Link>
            <h1>{lesson.lessonTitle}</h1>
            <p>Теория урока {String(lesson.number).padStart(2, '0')}</p>
            <StudyTopicList topics={lesson.topics} />
          </header>
          <nav className="theory-nav" aria-label="Разделы теории">
            <a href="#vocabulary">
              <Languages size={16} /> Лексика{' '}
              <b>{lesson.notes.filter((n) => n.kind === 'word').length}</b>
            </a>
            <a href="#grammar">
              <BookOpen size={16} /> Грамматика{' '}
              <b>{lesson.notes.filter((n) => n.kind === 'grammar').length}</b>
            </a>
          </nav>
          {(['word', 'grammar'] as const).map((kind) => {
            const grammar = kind === 'grammar',
              notes = lesson.notes.filter((n) => n.kind === kind);
            return (
              <section
                className={'theory-section' + (grammar ? ' theory-grammar' : '')}
                id={grammar ? 'grammar' : 'vocabulary'}
                key={kind}
              >
                <h2>{grammar ? 'Грамматика' : 'Лексика'}</h2>
                {grammar && notes.length ? (
                  <div className="theory-grammar-list">
                    {notes.map((n) => (
                      <GrammarArticle
                        key={n.key}
                        note={n}
                        guide={lesson.grammarGuides.find((g) => g.key === n.key)}
                      />
                    ))}
                  </div>
                ) : notes.length ? (
                  <dl className="theory-entries">
                    {notes.map((n) => (
                      <div key={n.key} className="theory-entry">
                        <dt lang={grammar ? 'ru' : lesson.language}>{n.title}</dt>
                        <dd>{n.meaning}</dd>
                        {n.example && (
                          <dd className="theory-example" lang={lesson.language}>
                            {n.example}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>В этом уроке нет новых {grammar ? 'грамматических правил' : 'слов'}.</p>
                )}
              </section>
            );
          })}
          <Link className="study-back" href={coursePath(lesson.language, lesson.level)}>
            <ArrowLeft size={16} /> К урокам курса
          </Link>
        </>
      )}
    </article>
  );
}
