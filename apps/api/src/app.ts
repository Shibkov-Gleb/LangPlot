import express from 'express';
import { ensureVisit } from './visits.js';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ProfileResponse, SessionResponse } from '@langplot/shared';
import { config, localMode } from './config.js';
import { db } from './db.js';
import { ApiError, errorHandler } from './errors.js';
import {
  createAccount,
  login,
  logout,
  profile,
  requireUser,
  session,
  startGuest,
} from './session.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '1mb', strict: true }));
app.use(cookieParser());
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && origin !== config.WEB_ORIGIN)
      throw new ApiError(403, 'ORIGIN_REJECTED', 'Этот источник запроса не разрешён.');
    if (req.headers['sec-fetch-site'] === 'cross-site')
      throw new ApiError(403, 'ORIGIN_REJECTED', 'Этот источник запроса не разрешён.');
    if (!req.is('application/json'))
      throw new ApiError(415, 'JSON_REQUIRED', 'Используйте application/json.');
  }
  next();
});
app.use(
  '/api',
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Слишком много запросов. Подождите минуту.' },
    },
  }),
);
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true, localMode });
});
app.use('/api', session);
app.post('/api/visit', async (req, res) => {
  await ensureVisit(req, res);
  res.json({ ok: true });
});
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Слишком много попыток. Попробуйте через 15 минут.',
    },
  },
});
app.post('/api/guest/start', startGuest);
app.post('/api/session/register', authLimit, (req, res) => createAccount(req, res));
app.post('/api/session/owner', authLimit, (req, res) => createAccount(req, res, true));
app.post('/api/session/login', authLimit, login);
app.delete('/api/session', logout);
app.get('/api/session', (req, res) =>
  res.json(SessionResponse.parse({ user: req.user ? profile(req.user) : null, localMode })),
);
app.get('/api/profile', requireUser, (req, res) =>
  res.json(ProfileResponse.parse({ user: profile(req.user!) })),
);

export function finishRoutes() {
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Такой адрес не найден.')));
  app.use(errorHandler);
}
