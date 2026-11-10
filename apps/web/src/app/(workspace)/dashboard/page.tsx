'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Layers3, ChevronRight } from 'lucide-react';
import { CatalogResponse, ProfileResponse, levels, languageNames } from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { coursePath } from '@/lib/course-paths';
import { api, body, errorText } from '@/lib/api';
export default function Dashboard() {
  const { user, setUser } = useProfile();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<ReturnType<typeof CatalogResponse.parse>>();
  useEffect(() => {
    let live = true;
    api('/catalog', CatalogResponse)
      .then((c) => {
        if (live) setCatalog(c);
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, []);
  const activeWorld = catalog?.worlds.find((world) => world.language === user.language);
  const courseFor = (level: typeof user.level) =>
    activeWorld?.levels.find((course) => course.level === level);
  const available = (level: typeof user.level) => courseFor(level)?.status === 'available';
  const selectedCourse = courseFor(user.level);
  async function select(language: 'en' | 'de', level = user.level, openCourse = false) {
    setBusy(true);
    setError('');
    try {
      const result = await api('/profile/selection', ProfileResponse, {
        method: 'PUT',
        body: body({ language, level }),
      });
      setUser(result.user);
      if (openCourse) router.push(coursePath(language, level));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow muted">НОВАЯ ГЛАВА ЖДЁТ ВАС</div>
          <h1>
            Ваши языковые миры<span>.</span>
          </h1>
          <p>Выберите язык и уровень, чтобы открыть историю.</p>
        </div>
        <span className="outlined-icon">
          <CompassIcon />
        </span>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <section aria-labelledby="world-title">
        <div className="section-label">
          <h2 id="world-title">
            01 <span>Выберите свой мир</span>
          </h2>
          <span>2 направления</span>
        </div>
        <div className="dashboard-worlds">
          {(['en', 'de'] as const).map((language) => (
            <button
              key={language}
              onClick={() => select(language, language === 'en' ? 'A2' : user.level)}
              disabled={busy}
              aria-pressed={user.language === language}
              className={`dashboard-world ${language === 'de' ? 'in-development' : 'world-live'} ${user.language === language ? 'selected' : ''}`}
            >
              <Image
                src={
                  language === 'en' ? '/assets/last-row/arrival.webp' : '/images/german-world.webp'
                }
                alt=""
                fill
                loading="eager"
                sizes="(max-width: 768px) 100vw, 40vw"
              />
              <div className="world-overlay" />
              <div className="dashboard-world-top">
                <span className="world-code">{language.toUpperCase()}</span>
                <span className="selection-circle">
                  {user.language === language && <Check size={13} />}
                </span>
              </div>
              <div className="dashboard-world-bottom">
                <div>
                  <h3>{languageNames[language]}</h3>
                  <p>{language === 'en' ? 'Последняя перекличка' : 'Готовим первые главы'}</p>
                </div>
                <span className="tag">
                  {catalog?.worlds
                    .find((w) => w.language === language)
                    ?.levels.filter((l) => l.status === 'available')
                    .map((l) => l.level)
                    .map((level) => level + ' · Доступен')
                    .join(' · ') || 'В разработке'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="level-section" aria-labelledby="level-title">
        <div className="section-label">
          <h2 id="level-title">
            02 <span>Найдите свою точку старта</span>
          </h2>
          <span>Выбор можно изменить</span>
        </div>
        <div className="levels">
          {levels.map((level) => (
            <button
              key={level}
              aria-pressed={user.level === level}
              disabled={busy}
              onClick={() => select(user.language, level, available(level))}
              className={[
                available(level) ? 'level-live' : 'in-development',
                user.level === level ? 'selected' : '',
              ].join(' ')}
            >
              <span>{level}</span>
              <small>{available(level) ? 'Доступен' : 'В разработке'}</small>
              {user.level === level && <Check size={13} />}
            </button>
          ))}
        </div>
      </section>
      <section
        className={
          selectedCourse?.status === 'available' ? 'selected-part' : 'selected-part in-development'
        }
      >
        <div className="part-icon">
          <Layers3 size={27} />
        </div>
        <div>
          <span className="eyebrow muted">
            {languageNames[user.language]} · {user.level}
          </span>
          <h3>{selectedCourse?.course?.title ?? 'В разработке'}</h3>
          <p>
            {selectedCourse?.status === 'available'
              ? 'Все уроки курса, ваши прохождения и открытая теория.'
              : 'Учебные главы для этого уровня готовятся.'}
          </p>
        </div>
        {selectedCourse?.status === 'available' && (
          <Link className="button primary" href={coursePath(user.language, user.level)}>
            Открыть курс <ChevronRight size={17} />
          </Link>
        )}
      </section>
      <div className="saved-caption" role="status">
        <Check size={13} />
        {busy ? 'Сохраняем выбор…' : 'Выбор сохранён в вашем профиле'}
      </div>
    </>
  );
}
function CompassIcon() {
  return <Layers3 size={27} />;
}
