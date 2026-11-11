import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Prisma, User } from '@prisma/client';
import { z } from 'zod';
import { db } from './db.js';
import { config, isQaRequest } from './config.js';
export const variant = config.UI_VARIANT;
export const visitCookie = 'langplot_visit_' + variant;
export function visitKey(req: Request) {
  const value = req.cookies?.[visitCookie];
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    ? createHash('sha256').update(value).digest('hex')
    : undefined;
}
const sourceSchema = z
  .object({
    source: z
      .string()
      .regex(/^[a-z0-9._-]{1,64}$/i)
      .default('direct'),
  })
  .strict();
export async function ensureVisit(req: Request, res: Response) {
  const { source } = sourceSchema.parse(req.body);
  const prior = visitKey(req);
  if (prior && (await db.productVisit.findUnique({ where: { id: prior }, select: { id: true } })))
    return prior;
  const token = randomBytes(32).toString('hex'),
    id = createHash('sha256').update(token).digest('hex');
  await db.productVisit.create({
    data: {
      id,
      source: source.toLowerCase(),
      variant,
      excluded: !!req.user || isQaRequest(req),
    },
  });
  res.cookie(visitCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.WEB_ORIGIN.startsWith('https:'),
    path: '/api',
    maxAge: 365 * 86400000,
  });
  return id;
}
export async function attributeAccount(
  tx: Prisma.TransactionClient,
  req: Request,
  user: User,
  newAccount: boolean,
) {
  const id = visitKey(req);
  if (!id) return;
  const eligible =
    !user.demoKey && !user.excludedFromAnalytics && ['USER', 'SUBSCRIBER'].includes(user.role);
  if (newAccount && eligible)
    await tx.productVisit.updateMany({
      where: { id, userId: null, excluded: false },
      data: { userId: user.id },
    });
  else await tx.productVisit.updateMany({ where: { id, userId: null }, data: { excluded: true } });
}
// Trusted server-side adapter for a future verified payment notification.
export async function confirmFirstPayment(userId: string, confirmationId: string, paidAt: Date) {
  if (!confirmationId.trim() || !Number.isFinite(paidAt.getTime()))
    throw new Error('Invalid payment confirmation');
  await db.firstPayment.createMany({
    data: [{ userId, confirmationId, paidAt }],
    skipDuplicates: true,
  });
}
