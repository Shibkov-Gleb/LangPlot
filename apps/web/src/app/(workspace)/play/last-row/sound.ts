'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
export function useSceneSound(
  enabled: boolean,
  sceneId: string | undefined,
  ambience?: string,
  cue?: string,
) {
  const [armed, setArmed] = useState(false);
  const lastEffect = useRef('');
  useEffect(() => {
    if (!enabled || !armed || !ambience) return;
    const rain = new Audio(ambience);
    rain.loop = true;
    rain.volume = 0.4;
    const update = () => {
      if (document.hidden) rain.pause();
      else void rain.play().catch(() => {});
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      rain.pause();
    };
  }, [enabled, armed, ambience]);
  useEffect(() => {
    if (!enabled || !armed || !sceneId || lastEffect.current === sceneId) return;
    lastEffect.current = sceneId;
    if (!cue) return;
    const sound = new Audio(cue);
    sound.volume = 0.5;
    void sound.play().catch(() => {});
    return () => sound.pause();
  }, [armed, enabled, sceneId, cue]);
  return useCallback(() => setArmed(true), []);
}
