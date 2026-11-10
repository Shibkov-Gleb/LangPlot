import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Prisma, type User } from '@prisma/client';
import {
  LoginInput,
  RegisterInput,
  OwnerInput,
  isStaff,
  OkResponse,
  ProfileResponse,
} from '@langplot/shared';
import { config } from './config.js';
import { db } from './db.js';
import { ApiError } from './errors.js';
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
import { attributeAccount } from './visits.js';
const cookieName =
  config.UI_VARIANT === 'original' ? 'langplot_session' : 'langplot_session_first_scene';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.WEB_ORIGIN.startsWith('https:'),
  path: '/api',
};
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
async function passwordDigest(password: string) {
  const salt = randomBytes(16).toString('hex');
  return ['s1', salt, (await derive(password, salt)).toString('hex')].join(':');
}
export async function session(req: Request, _res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[cookieName];
  if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
    const entry = await db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: true },
    });
    if (
      entry &&
      entry.expiresAt > new Date() &&
      !entry.user.demoKey &&
      entry.user.email &&
      entry.user.passwordHash
    )
      req.user = entry.user;
  }
  next();
}
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Войдите в свой аккаунт.');
  next();
}
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !isStaff(req.user.role))
    throw new ApiError(403, 'STAFF_REQUIRED', 'Этот раздел доступен администраторам.');
  next();
}
export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'SUPERADMIN')
    throw new ApiError(
      403,
      'OWNER_REQUIRED',
      'Назначать администраторов может только главный администратор.',
    );
  next();
}
export function profile(user: User) {
  const {
    id,
    name,
    nativeLanguage,
    sound,
    subtitles,
    reducedMotion,
    language,
    level,
    email,
    role,
  } = user;
  return {
    id,
    name,
    nativeLanguage,
    sound,
    subtitles,
    reducedMotion,
    language,
    level,
    email,
    role,
    subscribed: user.subscribedAt !== null,
  };
}
async function issueSession(req: Request, res: Response, tx: Prisma.TransactionClient, user: User) {
  const previous = req.cookies?.[cookieName];
  if (typeof previous === 'string')
    await tx.session.deleteMany({ where: { tokenHash: tokenHash(previous) } });
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.SESSION_DAYS * 86400000);
  await tx.session.create({
    data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: expires },
  });
  return () =>
    res
      .cookie(cookieName, token, { ...cookieOptions, expires })
      .json(ProfileResponse.parse({ user: profile(user) }));
}
export async function createAccount(req: Request, res: Response, owner = false) {
  const invitation = owner ? OwnerInput.parse(req.body) : null;
  const input = invitation ?? RegisterInput.parse(req.body);
  const passwordHash = await passwordDigest(input.password);
  try {
    const send = await db.$transaction(async (tx) => {
      if (invitation) {
        const invite = await tx.ownerInvite.deleteMany({
          where: {
            id: 'initial',
            tokenHash: tokenHash(invitation.token),
            expiresAt: { gt: new Date() },
          },
        });
        if (!invite.count || (await tx.user.count({ where: { role: 'SUPERADMIN' } })))
          throw new ApiError(
            403,
            'INVITE_INVALID',
            'Ссылка недействительна или срок её действия истёк.',
          );
      }
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          excludedFromAnalytics:
            req.headers['x-langplot-qa'] === '1' || input.email.endsWith('.invalid'),
          role: owner ? 'SUPERADMIN' : 'USER',
          level: 'A2',
          lastLoginAt: new Date(),
        },
      });
      await attributeAccount(tx, req, user, true);
      return issueSession(req, res, tx, user);
    });
    send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ApiError(409, 'EMAIL_IN_USE', 'Этот адрес уже используется.');
    throw error;
  }
}
export async function login(req: Request, res: Response) {
  const { email, password } = LoginInput.parse(req.body);
  const user = await db.user.findUnique({ where: { email } });
  const [, salt, digest] = user?.passwordHash?.split(':') ?? [];
  const actual = await derive(password, salt ?? 'langplot-invalid-account');
  if (!user || !digest || !timingSafeEqual(actual, Buffer.from(digest, 'hex')))
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный адрес или пароль.');
  const send = await db.$transaction(async (tx) => {
    const current = await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await attributeAccount(tx, req, current, false);
    return issueSession(req, res, tx, current);
  });
  send();
}
export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[cookieName];
  if (typeof token === 'string')
    await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie(cookieName, cookieOptions).json(OkResponse.parse({ ok: true }));
}
