'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChartNoAxesCombined, ArrowUpRight, Sprout } from 'lucide-react';
import { ProgressResponse, languageNames } from '@langplot/shared';
import { useProfile } from '@/components/workspace';
import { api, errorText } from '@/lib/api';
export default function ProgressPage() {
  const { user } = useProfile();
  const [attempts, setAttempts] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/progress?language=${user.language}`, ProgressResponse)
      .then((r) => setAttempts(r.technicalAttempts))
      .catch((e) => setError(errorText(e)));
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
      <div className="info-row">
        <ChartNoAxesCombined size={22} />
        <p>
          Профиль знаний будет общим для всех частей одного языка.
          <br />
          <span>Технические сообщения: {attempts ?? '…'}. Они не считаются учебной оценкой.</span>
        </p>
      </div>
    </>
  );
}
