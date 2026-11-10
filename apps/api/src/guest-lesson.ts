import type { NextFunction, Request, Response } from 'express';
import type { Prisma, User } from '@prisma/client';
import { db } from './db.js';
import { ApiError } from './errors.js';

export const guestPrefix = 'guest-lesson:';
export const guestSlug = 'last-row';
export function isLessonGuest(user: User) {
  return (
    user.role === 'USER' &&
    !user.email &&
    !user.passwordHash &&
    user.demoKey?.startsWith(guestPrefix)
  );
}

// Only the first lesson's player and its phone use this guard. Account routes require req.user.
export async function requireLessonPlayer(req: Request, _res: Response, next: NextFunction) {
  if (req.user) return next();
  const guest = req.guest;
  if (!guest)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Откройте первый урок или войдите в аккаунт.');
  const allowed =
    req.params.slug !== undefined
      ? req.params.slug === guestSlug
      : await db.playthrough.findFirst({
          where: {
            id: String(req.params.id),
            userId: guest.id,
            contentVersion: { packageId: 'langplot.en.a2.last-row' },
          },
          select: { id: true },
        });
  if (!allowed)
    throw new ApiError(403, 'GUEST_LESSON_ONLY', 'Без регистрации доступен первый урок.');
  req.user = guest;
  next();
}

export async function lockGuest(tx: Prisma.TransactionClient, guest: User) {
  const locked = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "User" WHERE id = ${guest.id} AND "demoKey" = ${guest.demoKey} AND email IS NULL FOR UPDATE`;
  if (!locked.length)
    throw new ApiError(409, 'GUEST_CLAIMED', 'Прохождение уже сохранено. Войдите в аккаунт.');
  await tx.session.deleteMany({ where: { userId: guest.id } });
}

export async function mergeGuest(tx: Prisma.TransactionClient, guest: User, accountId: string) {
  await lockGuest(tx, guest);
  // The caller already holds a row lock on the destination account.
  const runs = await tx.playthrough.findMany({ where: { userId: guest.id, revision: { gt: 0 } } });
  for (const run of runs) {
    const max = await tx.playthrough.aggregate({
      where: { userId: accountId, contentVersionId: run.contentVersionId },
      _max: { runNumber: true },
    });
    await tx.playthrough.update({
      where: { id: run.id },
      data: {
        userId: accountId,
        runNumber: (max._max.runNumber ?? 0) + 1,
        updatedAt: run.updatedAt,
      },
    });
  }
  await tx.learningAttempt.updateMany({ where: { userId: guest.id }, data: { userId: accountId } });
  for (const {
    language,
    skillId,
    attempts,
    successes,
    reviewDueAt,
    reviewStage,
  } of await tx.skillState.findMany({ where: { userId: guest.id } })) {
    const key = { userId: accountId, language, skillId };
    const existing = await tx.skillState.findUnique({ where: { userId_language_skillId: key } });
    const keepGuestReview =
      reviewDueAt && (!existing?.reviewDueAt || reviewDueAt < existing.reviewDueAt);
    await tx.skillState.upsert({
      where: { userId_language_skillId: key },
      create: { ...key, attempts, successes, reviewDueAt, reviewStage },
      update: {
        attempts: { increment: attempts },
        successes: { increment: successes },
        ...(keepGuestReview ? { reviewDueAt, reviewStage } : {}),
      },
    });
  }
  await tx.productVisit.updateMany({
    where: { userId: guest.id },
    data: { userId: null, excluded: true },
  });
  await tx.user.delete({ where: { id: guest.id } });
}
