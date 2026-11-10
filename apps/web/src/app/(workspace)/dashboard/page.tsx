'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Gamepad2, Layers3, ChevronRight, Sparkles } from 'lucide-react';
import {
  CatalogResponse,
  ProfileResponse,
  levels,
  levelDescriptions,
  languageNames,
} from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { coursePath } from '@/lib/course-paths';
import { api, body, errorText } from '@/lib/api';
export default function Dashboard() {
  const { user, setUser, localMode } = useProfile();
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
  const selectedCourse = catalog?.worlds
    .find((w) => w.language === user.language)
    ?.levels.find((l) => l.level === user.level)?.course;
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
          <p>Выберите язык и уровень. Остальное начинается с любопытства.</p>
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
              onClick={() => select(language)}
              disabled={busy}
              aria-pressed={user.language === language}
              className={`dashboard-world ${user.language === language ? 'selected' : ''}`}
            >
              <Image
                src={`/images/${language === 'en' ? 'english' : 'german'}-world.webp`}
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
                  <p>{language === 'en' ? 'Мир новых возможностей' : 'Свой взгляд на привычное'}</p>
                </div>
                <span className="tag">
                  {catalog?.worlds
                    .find((w) => w.language === language)
                    ?.levels.filter((l) => l.status === 'available')
                    .map((l) => l.level)
                    .join(' · ') || 'ГОТОВИТСЯ'}
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
              onClick={() => select(user.language, level, localMode)}
              className={user.level === level ? 'selected' : ''}
            >
              <span>{level}</span>
              <small>{levelDescriptions[level]}</small>
              {user.level === level && <Check size={13} />}
            </button>
          ))}
        </div>
      </section>
      <section className="selected-part">
        <div className="part-icon">
          <Layers3 size={27} />
        </div>
        <div>
          <span className="eyebrow muted">
            {languageNames[user.language]} · {user.level}
          </span>
          <h3>{selectedCourse?.title ?? 'Уроки курса'}</h3>
          <p>
            {selectedCourse
              ? 'Все уроки курса, ваши прохождения и открытая теория.'
              : 'Учебные главы для этого уровня готовятся.'}
          </p>
        </div>
        {localMode && (
          <Link className="button primary" href={coursePath(user.language, user.level)}>
            Открыть курс <ChevronRight size={17} />
          </Link>
        )}
      </section>
      <div className="dashboard-bottom-grid">
        {localMode && (
          <Link className="technical-card" href="/play">
            <Gamepad2 size={24} />
            <div>
              <span className="tiny-label">ТЕХНИЧЕСКИЙ МАКЕТ</span>
              <h3>Заглянуть за кулисы</h3>
              <p>
                Попробуйте выборы, телефон и сохранения.
                <br />
                Это проверка механик, а не учебный курс.
              </p>
            </div>
            <ArrowUpRight size={22} />
          </Link>
        )}
        <div className="next-card">
          <Sparkles size={22} />
          <h3>Постепенно. По-своему.</h3>
          <p>Здесь появятся ваши открытия, знакомые персонажи и пройденные главы.</p>
        </div>
      </div>
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
