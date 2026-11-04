'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  Clock3,
  Gamepad2,
  Layers3,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { ProfileResponse, levels, levelDescriptions, languageNames } from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { Dialog } from '@/components/dialog';
import { api, body, errorText } from '@/lib/api';
export default function Dashboard() {
  const { user, setUser, localMode } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(false);
  async function select(language: 'en' | 'de', level = user.level) {
    setBusy(true);
    setError('');
    try {
      const result = await api('/profile/selection', ProfileResponse, {
        method: 'PUT',
        body: body({ language, level }),
      });
      setUser(result.user);
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
                <span className="tag">ГОТОВИТСЯ</span>
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
              onClick={() => select(user.language, level)}
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
          <span className="eyebrow muted">ВАША БУДУЩАЯ ИСТОРИЯ</span>
          <h3>
            {languageNames[user.language]} · {user.level}
          </h3>
          <p>Сюжет и учебные главы готовятся. Ваш выбор уже сохранён.</p>
        </div>
        <button className="button secondary" onClick={() => setNotice(true)}>
          О курсе <ChevronRight size={17} />
        </button>
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
      {notice && (
        <Dialog title="История ещё пишется" onClose={() => setNotice(false)}>
          <span className="icon-tile">
            <Clock3 size={26} />
          </span>
          <p>
            {languageNames[user.language]}, уровень {user.level} — будущая часть языкового мира. Мы
            готовим сюжет, диалоги и учебные материалы.
          </p>
          <p className="small muted-text">
            Сейчас можно познакомиться с техническим игровым экраном. Дата выхода курса пока не
            объявлена.
          </p>
          <button className="button primary full" onClick={() => setNotice(false)}>
            Буду ждать
          </button>
        </Dialog>
      )}
    </>
  );
}
function CompassIcon() {
  return <Layers3 size={27} />;
}
