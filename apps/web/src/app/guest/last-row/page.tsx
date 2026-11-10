'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GuestSessionResponse } from '@langplot/shared';
import { GuestLessonPlayer } from '../../(workspace)/play/last-row/lesson-player';
import { api, errorText } from '@/lib/api';
import { trackVisit } from '@/components/visit';

let starting: Promise<{ guest: boolean }> | undefined;
async function openSession() {
  await trackVisit();
  const open = () => api('/guest/start', GuestSessionResponse, { method: 'POST', body: '{}' });
  if (navigator.locks) return await navigator.locks.request('langplot-guest-start', open);
  return open();
}
function start() {
  starting ??= openSession().finally(() => {
    starting = undefined;
  });
  return starting;
}
export default function GuestLessonPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    start()
      .then((session) => {
        if (!active) return;
        if (session.guest) setReady(true);
        else router.replace('/play/last-row');
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [router, attempt]);
  return (
    <main id="main" className="player-main">
      {ready ? (
        <GuestLessonPlayer />
      ) : (
        <div className="lr-page">
          <div className="lr-loading">
            {error ? (
              <>
                <p role="alert">{error}</p>
                <button
                  onClick={() => {
                    setError('');
                    setAttempt((value) => value + 1);
                  }}
                >
                  Попробовать снова
                </button>
              </>
            ) : (
              <p role="status">Открываем первый урок…</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
