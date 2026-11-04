import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@prisma/client';
import { OkResponse, ProfileResponse } from '@langplot/shared';
import { config, localMode } from './config.js';
import { db } from './db.js';
import { ApiError } from './errors.js';
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
const cookieName = 'langplot_session';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.WEB_ORIGIN.startsWith('https:'),
  path: '/api',
};
export function requireLocal(_req: Request, _res: Response, next: NextFunction) {
  if (!localMode)
    throw new ApiError(404, 'NOT_AVAILABLE', 'Раздел доступен только в локальном режиме.');
  next();
}
export async function session(req: Request, _res: Response, next: NextFunction) {
  if (!localMode) {
    next();
    return;
  }
  const token: unknown = req.cookies?.[cookieName];
  if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
    const entry = await db.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true },
    });
    if (entry && entry.expiresAt > new Date()) req.user = entry.user;
  }
  next();
}
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Войдите в демо-профиль.');
  next();
}
export async function demoLogin(req: Request, res: Response) {
  const user = await db.user.upsert({
    where: { demoKey: 'local-explorer' },
    update: {},
    create: { demoKey: 'local-explorer' },
  });
  const previous = req.cookies?.[cookieName];
  if (typeof previous === 'string')
    await db.session.deleteMany({ where: { tokenHash: hash(previous) } });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 86400000);
  await db.session.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt } });
  res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
  res.json(ProfileResponse.parse({ user: profile(user) }));
}
export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[cookieName];
  if (typeof token === 'string') await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  res.clearCookie(cookieName, cookieOptions).json(OkResponse.parse({ ok: true }));
}
export function profile(user: User) {
  const { id, name, nativeLanguage, sound, subtitles, reducedMotion, language, level } = user;
  return {
    id,
    name,
    nativeLanguage,
    sound,
    subtitles,
    reducedMotion,
    language,
    level,
    isDemo: true as const,
  };
}
