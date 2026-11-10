import { Prisma } from '@prisma/client';
import { DAY, moscowDay, type ReportFilter, type CrmFilter } from '@langplot/shared';
import { db } from './db.js';
import { config } from './config.js';
import { readyLessons, getLesson } from './course-catalog.js';
import { ApiError } from './errors.js';
export type Tx = Prisma.TransactionClient;
export const eligible: Prisma.UserWhereInput = {
  email: { not: null },
  demoKey: null,
  excludedFromAnalytics: false,
  role: { in: ['USER', 'SUBSCRIBER'] },
  NOT: { email: { endsWith: '.invalid' } },
};
const first = getLesson('last-row').content.manifest.id;
const byPackage = new Map([...readyLessons.values()].map((l) => [l.content.manifest.id, l]));
export function period(q: ReportFilter, now: Date) {
  const to = q.to ?? moscowDay(now),
    from = q.from ?? moscowDay(new Date(Date.parse(to) - 27 * DAY));
  const start = new Date(from + 'T00:00:00+03:00'),
    end = new Date(Date.parse(to + 'T00:00:00+03:00') + DAY);
  if (start >= end || end.getTime() - start.getTime() > 366 * DAY)
    throw new ApiError(400, 'REPORT_PERIOD', 'Выберите период до 366 дней.');
  return { from, to, start, end };
}
const actionFields = {
  createdAt: true,
  fromScene: true,
  toScene: true,
  terminal: true,
  correct: true,
  playthroughId: true,
  playthrough: {
    select: { userId: true, runNumber: true, contentVersion: { select: { packageId: true } } },
  },
} as const;
async function activity(tx: Tx, where: Prisma.PlayEventWhereInput) {
  return tx.playEvent.findMany({
    where: {
      ...where,
      fromScene: { not: null },
      playthrough: {
        ...(where.playthrough as Prisma.PlaythroughWhereInput),
        user: eligible,
        contentVersion: { packageId: { in: [...byPackage.keys()] } },
      },
    },
    select: actionFields,
    orderBy: { createdAt: 'asc' },
  });
}
type Action = Awaited<ReturnType<typeof activity>>[number];
type PersonFacts = { days: Set<string>; firstStart?: Date; firstFinish?: Date; anyStart?: Date };
function facts(rows: Action[]) {
  const people = new Map<string, PersonFacts>();
  for (const e of rows) {
    const id = e.playthrough.userId;
    const p = people.get(id) ?? ({ days: new Set<string>() } as PersonFacts);
    p.days.add(moscowDay(e.createdAt));
    p.anyStart ??= e.createdAt;
    if (e.playthrough.contentVersion.packageId === first) {
      p.firstStart ??= e.createdAt;
      if (e.terminal) p.firstFinish ??= e.createdAt;
    }
    people.set(id, p);
  }
  return people;
}
export const metricLabels = {
  visits: 'Первое посещение',
  registered: 'Создали аккаунт',
  started: 'Первое действие в уроке 01',
  finished: 'Завершили урок 01',
  completed7: 'Завершили урок 01 за 7 дней',
  d1: 'Вернулись к учёбе на D1',
  d7: 'Вернулись к учёбе на D7',
  stub: 'Активировали тестовую подписку',
  paid30: 'Первая оплата за 30 дней',
  paidAfter: 'Оплатили после первого урока за 30 дней',
};
type Key = keyof typeof metricLabels;
export type CohortPerson = {
  day: string;
  at: Date;
  userId: string | null;
  registered: Date | null;
  subscribed: Date | null;
  paid: Date | null;
  started: Date | null;
  finished: Date | null;
  days: Set<string>;
};
export function measure(people: CohortPerson[], now: Date, payments: boolean) {
  const result = Object.entries(metricLabels).map(([key, label]) => ({
    key: key as Key,
    label,
    count: 0,
    base: 0,
    pending: 0,
    enabled: !key.startsWith('paid') || payments,
  }));
  for (const p of people) {
    const age = now.getTime() - p.at.getTime();
    const within = (at: Date | null, n: number) =>
      !!at && at >= p.at && at.getTime() - p.at.getTime() <= n * DAY;
    for (const m of result) {
      if (!m.enabled) continue;
      const k = m.key;
      const mature =
        k === 'completed7'
          ? age >= 7 * DAY
          : k.startsWith('paid')
            ? age >= 30 * DAY
            : k === 'd1' || k === 'd7'
              ? moscowDay(now) > moscowDay(new Date(p.at.getTime() + (k === 'd1' ? 1 : 7) * DAY))
              : true;
      if (!mature) {
        m.pending++;
        continue;
      }
      if (k === 'paidAfter' && !within(p.finished, 30)) continue;
      m.base++;
      const matches: Record<Key, boolean> = {
        visits: true,
        registered: !!p.registered,
        started: !!p.started,
        finished: !!p.finished,
        completed7: within(p.finished, 7),
        d1: p.days.has(moscowDay(new Date(p.at.getTime() + DAY))),
        d7: p.days.has(moscowDay(new Date(p.at.getTime() + 7 * DAY))),
        stub: !!p.subscribed,
        paid30: within(p.paid, 30),
        paidAfter: within(p.paid, 30) && !!p.finished && p.paid! >= p.finished,
      };
      if (matches[k]) m.count++;
    }
  }
  return result;
}
async function cohort(tx: Tx, q: ReportFilter, span: ReturnType<typeof period>) {
  const visits = await tx.productVisit.findMany({
    where: {
      excluded: false,
      firstAt: { gte: span.start, lt: span.end },
      source: q.source,
      variant: q.variant,
      OR: [{ userId: null }, { user: eligible }],
    },
    select: {
      firstAt: true,
      userId: true,
      guestDays: true,
      user: { select: { createdAt: true, subscribedAt: true, payment: true } },
    },
  });
  const f = facts(
    await activity(tx, {
      playthrough: { userId: { in: visits.flatMap((v) => (v.userId ? [v.userId] : [])) } },
    }),
  );
  return visits.map((v): CohortPerson => {
    const p = f.get(v.userId ?? '');
    const days = new Set([...(p?.days ?? []), ...v.guestDays.map((d) => d.day)]);
    const starts = [p?.firstStart, ...v.guestDays.map((d) => d.firstAt)].filter(
      (v): v is Date => !!v,
    );
    return {
      day: moscowDay(v.firstAt),
      at: v.firstAt,
      userId: v.userId,
      registered: v.user?.createdAt ?? null,
      subscribed: v.user?.subscribedAt ?? null,
      paid: v.user?.payment?.paidAt ?? null,
      started: starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
      finished: p?.firstFinish ?? null,
      days,
    };
  });
}
export async function overview(tx: Tx, q: ReportFilter, now: Date) {
  const span = period(q, now),
    length = span.end.getTime() - span.start.getTime();
  const prev = period(
    {
      from: moscowDay(new Date(span.start.getTime() - length)),
      to: moscowDay(new Date(span.start.getTime() - 1)),
    },
    now,
  );
  const [people, previous, setup, sources] = await Promise.all([
    cohort(tx, q, span),
    cohort(tx, q, prev),
    tx.reportSetup.findUniqueOrThrow({ where: { id: 'visits' } }),
    tx.productVisit.findMany({
      where: { excluded: false, OR: [{ userId: null }, { user: eligible }] },
      distinct: ['source'],
      select: { source: true },
      orderBy: { source: 'asc' },
    }),
  ]);
  const payments =
    config.PAYMENTS_ENABLED === 'true' ||
    !!(await tx.firstPayment.findFirst({ where: { user: eligible }, select: { userId: true } }));
  return {
    data: {
      from: span.from,
      to: span.to,
      previousFrom: prev.from,
      previousTo: prev.to,
      trackingSince: setup.startedAt.toISOString(),
      metrics: measure(people, now, payments),
      previous: measure(previous, now, payments),
      sources: sources.map((s) => s.source),
    },
    people,
    payments,
  };
}
export async function lessonReport(tx: Tx, q: ReportFilter, now: Date) {
  const span = period(q, now);
  const attributed =
    q.variant || q.source
      ? { visit: { variant: q.variant, source: q.source, excluded: false } }
      : {};
  const ids = await tx.user.findMany({
    where: { ...eligible, ...attributed },
    select: { id: true },
  });
  const events = await activity(tx, {
    createdAt: { lt: span.end },
    playthrough: { userId: { in: ids.map((u) => u.id) } },
  });
  const chapters = new Map<
    number,
    {
      number: number;
      title: string;
      starts: Map<string, Date[]>;
      finishes: Map<string, Date>;
      replays: Set<string>;
    }
  >();
  const scenes = new Map(
    getLesson('last-row').content.scenes.map((s) => [
      s.id,
      { id: s.id, text: s.text, users: new Set<string>(), actions: 0, mistakes: 0 },
    ]),
  );
  for (const l of readyLessons.values())
    if (!chapters.has(l.number))
      chapters.set(l.number, {
        number: l.number,
        title: l.route ? 'Два пути расследования' : l.content.manifest.title,
        starts: new Map(),
        finishes: new Map(),
        replays: new Set(),
      });
  const seen = new Set<string>(),
    original = new Set<string>();
  for (const e of events) {
    const l = byPackage.get(e.playthrough.contentVersion.packageId)!;
    const c = chapters.get(l.number)!;
    const u = e.playthrough.userId;
    const key = u + '/' + l.number;
    const inPeriod = e.createdAt >= span.start;
    if (!seen.has(e.playthroughId)) {
      seen.add(e.playthroughId);
      if (inPeriod) {
        const dates = c.starts.get(u) ?? [];
        dates.push(e.createdAt);
        c.starts.set(u, dates);
        if (original.has(key) || e.playthrough.runNumber > 1) c.replays.add(e.playthroughId);
      }
      original.add(key);
    }
    if (!inPeriod) continue;
    if (e.terminal && !c.finishes.has(u)) c.finishes.set(u, e.createdAt);
    if (l.number === 1) {
      const sc = scenes.get(e.fromScene!);
      if (sc) {
        sc.users.add(u);
        sc.actions++;
        if (e.correct === false) sc.mistakes++;
      }
    }
  }
  return {
    lessons: [...chapters.values()].map((c) => {
      const next = chapters.get(c.number + 1);
      return {
        number: c.number,
        title: c.title,
        started: c.starts.size,
        finished: c.finishes.size,
        replays: c.replays.size,
        continued: next
          ? [...c.finishes].filter(([id, finish]) => next.starts.get(id)?.some((t) => t >= finish))
              .length
          : null,
      };
    }),
    scenes: [...scenes.values()].map(({ users, ...s }) => ({ ...s, people: users.size })),
  };
}
export async function segmentIds(tx: Tx, q: CrmFilter, now: Date) {
  if (!q.segment && !q.source && !q.variant && !q.from && !q.to) return undefined;
  const span = period(q, now),
    dated = !!(q.from || q.to);
  const attributed = !!(
    q.variant ||
    q.source ||
    q.segment === 'completed7' ||
    q.segment === 'registered'
  );
  const users = await tx.user.findMany({
    where: {
      ...eligible,
      ...(attributed
        ? {
            visit: {
              excluded: false,
              variant: q.variant,
              source: q.source,
              ...(dated ? { firstAt: { gte: span.start, lt: span.end } } : {}),
            },
          }
        : dated
          ? { createdAt: { gte: span.start, lt: span.end } }
          : {}),
    },
    select: {
      id: true,
      visit: { select: { firstAt: true, guestDays: { orderBy: { firstAt: 'asc' }, take: 1 } } },
    },
  });
  const f = facts(await activity(tx, { playthrough: { userId: { in: users.map((u) => u.id) } } }));
  return users
    .filter((u) => {
      const p = f.get(u.id);
      const start = u.visit?.guestDays[0]?.firstAt ?? p?.firstStart;
      switch (q.segment) {
        case 'not-started':
          return !p?.anyStart && !start;
        case 'stalled':
          return !!start && !p?.firstFinish && now.getTime() - start.getTime() >= 2 * DAY;
        case 'completed':
          return !!p?.firstFinish;
        case 'completed7':
          return (
            !!u.visit &&
            !!p?.firstFinish &&
            now.getTime() - u.visit.firstAt.getTime() >= 7 * DAY &&
            p.firstFinish.getTime() - u.visit.firstAt.getTime() <= 7 * DAY
          );
        default:
          return true;
      }
    })
    .map((u) => u.id);
}
export const snapshot = <T>(work: (tx: Tx) => Promise<T>) =>
  db.$transaction(work, { isolationLevel: 'RepeatableRead', timeout: 30000 });
