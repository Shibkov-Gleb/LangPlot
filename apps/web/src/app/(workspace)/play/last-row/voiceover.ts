'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useVoiceover(enabled: boolean, url?: string) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    setError('');
    if (!url || !enabled) return;
    const clip = new Audio(url);
    clip.preload = 'none';
    audio.current = clip;
    const failed = () => setError('Озвучка не загрузилась. Попробуйте прослушать реплику ещё раз.');
    const visible = () => {
      if (document.hidden) clip.pause();
    };
    clip.addEventListener('error', failed);
    document.addEventListener('visibilitychange', visible);
    if (armed)
      void clip.play().catch((e) => {
        if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') failed();
      });
    return () => {
      clip.removeEventListener('error', failed);
      document.removeEventListener('visibilitychange', visible);
      clip.pause();
      clip.removeAttribute('src');
      clip.load();
      if (audio.current === clip) audio.current = null;
    };
  }, [enabled, url, armed]);
  const replay = useCallback(() => {
    setArmed(true);
    setError('');
    const clip = audio.current;
    if (!clip || !enabled) return;
    clip.currentTime = 0;
    void clip.play().catch((e) => {
      if (e.name !== 'AbortError') setError('Не удалось включить озвучку. Нажмите ещё раз.');
    });
  }, [enabled]);
  return { armVoice: useCallback(() => setArmed(true), []), replay, speechError: error };
}
