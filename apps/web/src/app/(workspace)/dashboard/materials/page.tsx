'use client';
import Link from 'next/link';
import { ArrowRight, BookOpen, ChevronRight } from 'lucide-react';
import { MaterialsResponse, languageNames } from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { coursePath, theoryPath } from '@/lib/course-paths';
import { useStudyResource } from '@/lib/use-study-resource';

export default function MaterialsPage() {
  const { user, localMode } = useProfile();
  const { data, error, reload } = useStudyResource('/materials', MaterialsResponse);
  const groups = new Map<string, MaterialsResponse['lessons']>();
  data?.lessons.forEach((lesson) => {
    const path = coursePath(lesson.language, lesson.level);
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path)!.push(lesson);
  });
  return (
    <div className="study-page">
      <header className="theory-heading">
        <h1>Мои материалы</h1>
        <p>Слова, примеры и грамматические правила из пройденных уроков.</p>
      </header>
      {localMode && error ? (
        <div className="study-state">
          <p role="alert">{error}</p>
          <button className="button secondary" onClick={reload}>
            Повторить
          </button>
        </div>
      ) : localMode && !data ? (
        <p role="status">Открываем материалы…</p>
      ) : !groups.size ? (
        <div className="study-state">
          <span className="empty-icon">
            <BookOpen size={36} />
          </span>
          <h2>Первый урок откроет вашу коллекцию</h2>
          <p>Когда вы завершите урок, здесь появится вся его лексика и грамматика.</p>
          <Link
            className="button secondary"
            href={localMode ? coursePath(user.language, user.level) : '/dashboard'}
          >
            К урокам <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        Array.from(groups, ([path, lessons]) => {
          const first = lessons[0]!;
          return (
            <section className="material-course" key={path}>
              <span className="study-kicker">
                {languageNames[first.language]} · {first.level}
              </span>
              <h2>
                <Link href={path}>{first.title}</Link>
              </h2>
              <ol className="material-links">
                {lessons.map((l) => (
                  <li key={l.slug}>
                    <Link href={theoryPath(l.slug)}>
                      <span className="lesson-num">{String(l.number).padStart(2, '0')}</span>
                      <span>
                        <strong>{l.lessonTitle}</strong>
                        <small>Лексика и грамматика</small>
                      </span>
                      <ChevronRight size={18} />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          );
        })
      )}
    </div>
  );
}
