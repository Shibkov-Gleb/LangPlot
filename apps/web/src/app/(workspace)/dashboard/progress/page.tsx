'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChartNoAxesCombined, ArrowUpRight, Sprout } from 'lucide-react';
import { ProgressResponse, languageNames } from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { api, errorText } from '@/lib/api';
export default function ProgressPage() {
  const { user } = useProfile();
  const [progress, setProgress] = useState<ReturnType<typeof ProgressResponse.parse> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api(`/progress?language=${user.language}`, ProgressResponse)
      .then((r) => {
        if (live) {
          setProgress(r);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [user.language]);
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow muted">
            {languageNames[user.language].toUpperCase()} / ВАШ ПУТЬ
          </div>
          <h1>
            Каждый шаг имеет значение<span>.</span>
          </h1>
          <p>Здесь будет видно, что уже получается, а чему нужно чуть больше времени.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {progress?.skills.length ? (
        <section className="info-row">
          <div>
            <h2>Практика урока</h2>
            <ul>
              {progress.skills.map((s) => (
                <li key={s.skillId}>
                  {s.description ?? s.skillId} — верных ответов {s.successes} из {s.attempts}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <div className="empty-panel">
          <span className="empty-icon">
            <Sprout size={42} />
          </span>
          <span className="eyebrow muted">ВПЕРЕДИ МНОГО ОТКРЫТИЙ</span>
          <h2>Ваш путь только начинается.</h2>
          <p>
            После первых учебных глав здесь появятся освоенные темы,
            <br />
            словарный запас и рекомендации для практики.
          </p>
          <Link className="button secondary" href="/dashboard">
            К языковым мирам <ArrowUpRight size={18} />
          </Link>
        </div>
      )}
      <div className="info-row">
        <ChartNoAxesCombined size={22} />
        <p>
          Профиль знаний будет общим для всех частей одного языка.
          <br />
          <span>
            Технические сообщения: {progress?.technicalAttempts ?? '…'}. Они не считаются учебной
            оценкой.
          </span>
        </p>
      </div>
    </>
  );
}
