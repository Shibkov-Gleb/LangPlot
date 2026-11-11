import { z } from 'zod';
import type { Request } from 'express';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  UI_VARIANT: z.enum(['original', 'first-scene']).default('original'),
  PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.enum(['127.0.0.1', '0.0.0.0', '::']).default('127.0.0.1'),
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  WEB_ORIGIN: z
    .string()
    .url()
    .refine((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      );
    })
    .transform((value) => new URL(value).origin)
    .default('http://localhost:3000'),
  OWNER_INVITE_FILE: z.string().min(1).optional(),
  LOCAL_DEMO_MODE: z.enum(['true', 'false']).default('false'),
  SESSION_DAYS: z.coerce.number().min(1).max(30).default(7),
  CHAT_PROVIDER: z.enum(['local', 'none', 'deepseek']).default('local'),
  DEEPSEEK_MODEL: z
    .string()
    .regex(/^deepseek-[a-z0-9.-]+$/)
    .default('deepseek-flash'),
  COURSE_PROVIDER: z.enum(['local', 'none']).default('local'),
  TTS_PROVIDER: z.enum(['none', 'gemini']).default('none'),
  STORAGE_PROVIDER: z.literal('local').default('local'),
});
export function readConfig(env: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw Error(
      'Некорректные переменные окружения: ' +
        [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', '),
    );
  if (env.NODE_ENV === 'production') {
    if (!parsed.data.WEB_ORIGIN.startsWith('https://'))
      throw Error('WEB_ORIGIN должен использовать HTTPS в production.');
    if (parsed.data.CHAT_PROVIDER === 'deepseek' && !(env.DEEPSEEK_API_KEY || env.DEEPSEEK_API))
      throw Error('Для CHAT_PROVIDER=deepseek задайте DEEPSEEK_API_KEY.');
  }
  return parsed.data;
}
export const config = readConfig(process.env);
export const isQaRequest = (req: Pick<Request, 'headers'>) =>
  process.env.NODE_ENV !== 'production' && req.headers['x-langplot-qa'] === '1';
export const localMode = config.LOCAL_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
// External tracing is deliberately disabled, including values inherited from the shell.
process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
delete process.env.LANGCHAIN_API_KEY;
delete process.env.LANGSMITH_API_KEY;
