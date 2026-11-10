'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, LoaderCircle, Compass, ShieldCheck } from 'lucide-react';
import { ProfileResponse } from '@langplot/shared';
import { Brand } from '@/components/brand';
import { api, body, errorText } from '@/lib/api';
import { studyReturnPath } from '@/lib/course-paths';
export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function enter() {
    setPending(true);
    setError('');
    try {
      await api('/session/demo', ProfileResponse, { method: 'POST', body: '{}' });
      const query = new URLSearchParams(window.location.search);
      const lesson = query.get('lesson') === 'last-row';
      const target = studyReturnPath(query.get('next'));
      const course = target?.startsWith('/courses/') ? target.split('/') : undefined;
      const language = lesson ? 'en' : (course?.[2] ?? query.get('language'));
      if (language === 'en' || language === 'de')
        await api('/profile/selection', ProfileResponse, {
          method: 'PUT',
          body: body({ language, level: lesson ? 'A2' : (course?.[3]?.toUpperCase() ?? 'A1') }),
        });
      router.push(target ?? (lesson ? '/play/last-row' : '/dashboard'));
    } catch (e) {
      setError(errorText(e));
      setPending(false);
    }
  }
  return (
    <main id="main" className="login-page">
      <div className="login-image">
        <Image
          src="/images/english-world.webp"
          alt="Вечерняя станция в мире LangPlot"
          fill
          sizes="55vw"
        />
        <div />
        <span>
          У каждого языка
          <br />
          своя история.
        </span>
      </div>
      <div className="login-panel">
        <Brand />
        <Link className="back-link" href="/">
          <ArrowLeft size={16} /> На главную
        </Link>
        <div className="login-content">
          <span className="icon-tile">
            <Compass size={27} />
          </span>
          <div className="eyebrow muted">ПЕРВОЕ ЗНАКОМСТВО</div>
          <h1>
            Добро пожаловать
            <br />в LangPlot.
          </h1>
          <p>
            Загляните в свои будущие языковые миры. Выберите язык, найдите свой уровень и
            познакомьтесь с игровым пространством.
          </p>
          <button className="button primary full" onClick={enter} disabled={pending}>
            {pending ? (
              <>
                <LoaderCircle className="spin" size={18} /> Открываем кабинет…
              </>
            ) : (
              <>
                Войти в демо-профиль <ArrowUpRight size={20} />
              </>
            )}
          </button>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="demo-note">
            <ShieldCheck size={19} />
            <p>
              Локальная демоверсия
              <br />
              <span>
                Без регистрации. Один общий тестовый профиль на этом сервере. Курсы ещё готовятся.
              </span>
            </p>
          </div>
        </div>
        <span className="small muted-text">LangPlot · Пространство для новых историй</span>
      </div>
    </main>
  );
}
