'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { api, ClientError, errorText } from './api';

export function useStudyResource<T extends z.ZodTypeAny>(path: string, schema: T) {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    generation: number;
    data?: z.output<T>;
    error?: string;
    errorCode?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    api(path, schema, { signal: controller.signal, cache: 'no-store' })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ path, generation, data });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResult({
            path,
            generation,
            error: errorText(e),
            errorCode: e instanceof ClientError ? e.code : undefined,
          });
      });
    return () => controller.abort();
  }, [path, schema, generation]);
  const current = result?.path === path && result.generation === generation ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    errorCode: current?.errorCode,
    reload: () => setGeneration((n) => n + 1),
  };
}
