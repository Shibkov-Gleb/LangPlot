import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  UI_VARIANT: z.enum(['original', 'first-scene']).default('original'),
  PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().default(4000),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOCAL_DEMO_MODE: z.enum(['true', 'false']).default('false'),
  SESSION_DAYS: z.coerce.number().min(1).max(30).default(7),
  CHAT_PROVIDER: z.enum(['local', 'none']).default('local'),
  COURSE_PROVIDER: z.enum(['local', 'none']).default('local'),
  TTS_PROVIDER: z.enum(['none', 'gemini']).default('none'),
  STORAGE_PROVIDER: z.literal('local').default('local'),
});
export const config = schema.parse(process.env);
export const localMode = config.LOCAL_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
// External tracing is deliberately disabled, including values inherited from the shell.
process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
delete process.env.LANGCHAIN_API_KEY;
delete process.env.LANGSMITH_API_KEY;
