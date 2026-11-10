'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { ProfileResponse, SessionResponse } from '@langplot/shared';
import { Brand } from '@/components/brand';
import { api, body, errorText } from '@/lib/api';
import { studyReturnPath } from '@/lib/course-paths';
function destination() {
  const query = new URLSearchParams(window.location.search);
  return (
    studyReturnPath(query.get('next')) ??
    (query.get('lesson') === 'last-row' ? '/play/last-row' : '/dashboard')
  );
}
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register' | 'owner'>('login');
  const [invite, setInvite] = useState('');
  const [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('owner');
    if (token) {
      setInvite(token);
      setMode('owner');
      setReady(true);
      return;
    }
    let live = true;
    api('/session', SessionResponse)
      .then((session) => {
        if (!live) return;
        if (session.user) router.replace(destination());
        else setReady(true);
      })
      .catch(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [router]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setError('');
    setPending(true);
    try {
      const credentials = { email: fields.get('email'), password: fields.get('password') };
      const input =
        mode === 'login'
          ? credentials
          : {
              ...credentials,
              name: fields.get('name'),
              ...(mode === 'owner' ? { token: invite } : {}),
            };
      await api('/session/' + mode, ProfileResponse, { method: 'POST', body: body(input) });
      const target = destination(),
        course = target.match(/^\/courses\/(en|de)\/(a1|a2|b1|b2|c1|c2)$/);
      const language = course?.[1] ?? new URLSearchParams(window.location.search).get('language');
      if (language === 'en' || language === 'de')
        await api('/profile/selection', ProfileResponse, {
          method: 'PUT',
          body: body({
            language,
            level: course?.[2]?.toUpperCase() ?? (language === 'en' ? 'A2' : 'A1'),
          }),
        });
      router.replace(mode === 'owner' ? '/admin' : target);
    } catch (e) {
      setError(errorText(e));
      setPending(false);
    }
  }
  const register = mode !== 'login';
  return (
    <main id="main" className="login-page">
      <div className="login-image">
        <Image
          src="/assets/last-row/arrival.webp"
          alt="Автобус у освещённой остановки в горах Олдер-Свитч"
          fill
          sizes="55vw"
        />
        <div />
        <span>
          Последняя перекличка<small>Английский · A2</small>
        </span>
      </div>
      <div className="login-panel">
        <Brand />
        <Link className="back-link" href="/">
          <ArrowLeft size={16} /> На главную
        </Link>
        <div className="login-content account-form">
          <h1>
            {mode === 'owner'
              ? 'Главный администратор'
              : register
                ? 'Создать аккаунт'
                : 'Вход в LangPlot'}
          </h1>
          <p>
            {mode === 'owner'
              ? 'Задайте имя, адрес и пароль для управления сервисом.'
              : register
                ? 'Ваш аккаунт сохранит выборы, пройденные главы и учебные материалы.'
                : 'Войдите, чтобы продолжить свою историю.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label className="field">
                Имя
                <input name="name" autoComplete="nickname" maxLength={60} required />
              </label>
            )}
            <label className="field">
              Электронная почта
              <input name="email" type="email" autoComplete="email" maxLength={254} required />
            </label>
            <label className="field">
              Пароль
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 10 : 1}
                maxLength={128}
                required
              />
              {register && <small>От 10 символов</small>}
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={!ready || pending}>
              {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{' '}
              {register ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </form>
          {mode !== 'owner' && (
            <button
              type="button"
              className="auth-switch"
              disabled={pending}
              onClick={() => {
                setError('');
                setMode(register ? 'login' : 'register');
              }}
            >
              {register ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
