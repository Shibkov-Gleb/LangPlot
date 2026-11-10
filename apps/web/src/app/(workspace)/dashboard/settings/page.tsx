'use client';
import { useState } from 'react';
import { Save, Volume2, Captions, Waves, UserRound } from 'lucide-react';
import { ProfileResponse, ProfileSettings, roleNames, isStaff } from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { api, body, errorText } from '@/lib/api';
export default function SettingsPage() {
  const { user, setUser } = useProfile();
  const [values, setValues] = useState(
    ProfileSettings.parse({
      name: user.name,
      nativeLanguage: user.nativeLanguage,
      sound: user.sound,
      subtitles: user.subtitles,
      reducedMotion: user.reducedMotion,
    }),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/profile', ProfileResponse, {
        method: 'PATCH',
        body: body(values),
      });
      setUser(result.user);
      setMessage('Настройки сохранены.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  async function subscribe() {
    setPending(true);
    setMessage('');
    setError('');
    try {
      const result = await api('/subscription/test', ProfileResponse, {
        method: 'POST',
        body: '{}',
      });
      setUser(result.user);
      setMessage('Тестовая подписка активирована.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow muted">ВАШЕ ПРОСТРАНСТВО</div>
          <h1>
            Настройки<span>.</span>
          </h1>
          <p>Сделайте LangPlot удобным для себя.</p>
        </div>
      </div>
      <form className="settings-form" onSubmit={save}>
        <section className="panel">
          <div className="panel-heading">
            <UserRound size={20} />
            <h2>Мой аккаунт</h2>
          </div>
          <p className="account-email">{user.email}</p>
          <label className="field">
            Как к вам обращаться
            <input
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              required
              maxLength={60}
              autoComplete="nickname"
            />
          </label>
          <label className="field">
            Родной язык
            <select
              value={values.nativeLanguage}
              onChange={(e) =>
                setValues({ ...values, nativeLanguage: e.target.value as 'ru' | 'en' | 'de' })
              }
            >
              <option value="ru">Русский</option>
              <option value="en">Английский</option>
              <option value="de">Немецкий</option>
            </select>
          </label>
        </section>
        <section className="panel">
          <h2>Игровое пространство</h2>
          {[
            {
              key: 'sound' as const,
              label: 'Звук',
              note: 'Звуковые эффекты в игре.',
              icon: Volume2,
            },
            {
              key: 'subtitles' as const,
              label: 'Субтитры',
              note: 'Показывать текст реплик в игровом экране.',
              icon: Captions,
            },
            {
              key: 'reducedMotion' as const,
              label: 'Меньше анимации',
              note: 'Убрать движение и плавные переходы в кабинете.',
              icon: Waves,
            },
          ].map(({ key, label, note, icon: Icon }) => (
            <label className="toggle-row" key={key}>
              <Icon size={21} />
              <span>
                <strong>{label}</strong>
                <small>{note}</small>
              </span>
              <input
                className="toggle"
                type="checkbox"
                checked={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.checked })}
              />
            </label>
          ))}
        </section>
        <section className="panel subscription-panel">
          <h2>Подписка</h2>
          <strong>{roleNames[user.role]}</strong>
          {isStaff(user.role) ? (
            <p>Вам доступны все учебные функции.</p>
          ) : (
            <>
              <p>
                Английский A2 доступен всем ученикам. Тестовая подписка бесплатна, платёжные данные
                не требуются.
              </p>
              {!user.subscribed && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending}
                  onClick={subscribe}
                >
                  Активировать тестовую подписку
                </button>
              )}
            </>
          )}
        </section>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-box" role="status">
            {message}
          </p>
        )}
        <button className="button primary" disabled={pending}>
          <Save size={17} />
          {pending ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
      </form>
    </>
  );
}
