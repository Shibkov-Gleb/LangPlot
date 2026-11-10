import type { Prisma } from '@prisma/client';
import {
  AdminAssignment,
  ContactUpdate,
  CrmDetail,
  CrmFilter,
  CrmList,
  CrmMetrics,
  NoteInput,
  OkResponse,
  ProfileResponse,
  roleNames,
  stageNames,
} from '@langplot/shared';
import { reportRoutes, studentQuery } from './report-routes.js';
import { snapshot } from './report-service.js';
import { app } from './app.js';
import { db } from './db.js';
import { ApiError } from './errors.js';
import { profile, requireUser, requireOwner, requireStaff } from './session.js';
import { readyLessons } from './course-catalog.js';

const fields = {
  id: true,
  name: true,
  email: true,
  role: true,
  subscribedAt: true,
  language: true,
  level: true,
  contactStage: true,
  followUpAt: true,
  createdAt: true,
  lastLoginAt: true,
} as const;
type Person = Prisma.UserGetPayload<{ select: typeof fields }>;
const accounts = { email: { not: null }, demoKey: null };
function contact(user: Person) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    subscribed: !!user.subscribedAt,
    language: user.language,
    level: user.level,
    stage: user.contactStage,
    followUp: user.followUpAt?.toISOString().slice(0, 10) ?? null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}
function missing() {
  return new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Аккаунт не найден.');
}
async function findContact(id: string) {
  const user = await db.user.findFirst({ where: { id, ...accounts }, select: fields });
  if (!user) throw missing();
  return user;
}
export function registerAccountRoutes() {
  app.post('/api/subscription/test', requireUser, async (req, res) => {
    const user = await db.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: req.user!.id, role: 'USER' },
        data: { role: 'SUBSCRIBER', subscribedAt: new Date() },
      });
      return tx.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    });
    res.json(ProfileResponse.parse({ user: profile(user) }));
  });
  app.use('/api/admin', requireUser, requireStaff);
  reportRoutes();
  app.get('/api/admin/metrics', async (_req, res) => {
    const [count, subscribed, recentLogins, due] = await db.$transaction([
      db.user.count({ where: accounts }),
      db.user.count({ where: { ...accounts, subscribedAt: { not: null } } }),
      db.user.count({
        where: { ...accounts, lastLoginAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      db.user.count({ where: { ...accounts, followUpAt: { lte: new Date() } } }),
    ]);
    res.json(CrmMetrics.parse({ accounts: count, subscribed, recentLogins, due }));
  });
  app.get('/api/admin/users', async (req, res) => {
    const query = CrmFilter.parse(req.query);
    const result = await snapshot(async (tx) => {
      const where = await studentQuery(tx, query, new Date());
      const pageSize = 20,
        total = await tx.user.count({ where });
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
      const users = await tx.user.findMany({
        where,
        select: fields,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
      return { total, users: users.map(contact), page, pageSize };
    });
    res.json(CrmList.parse(result));
  });
  app.get('/api/admin/users/:id', async (req, res) => {
    const user = await findContact(String(req.params.id));
    const where = { userId: user.id, contentVersion: { status: { not: 'technical' } } };
    const [runs, attempts, recent, history] = await db.$transaction([
      db.playthrough.count({ where }),
      db.learningAttempt.count({ where: { userId: user.id } }),
      db.playthrough.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: { id: true, updatedAt: true, contentVersion: { select: { packageId: true } } },
      }),
      db.crmEvent.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        include: { author: { select: { name: true } } },
      }),
    ]);
    const titles = new Map(
      [...readyLessons.values()].map((l) => [l.content.manifest.id, l.content.manifest.title]),
    );
    res.json(
      CrmDetail.parse({
        user: contact(user),
        runs,
        attempts,
        lessons: recent.map((p) => ({
          id: p.id,
          title: titles.get(p.contentVersion.packageId) ?? p.contentVersion.packageId,
          updatedAt: p.updatedAt.toISOString(),
        })),
        history: history.map((e) => ({
          id: e.id,
          text: e.text,
          author: e.author.name,
          createdAt: e.createdAt.toISOString(),
        })),
      }),
    );
  });
  app.post('/api/admin/users/:id/notes', async (req, res) => {
    const { text } = NoteInput.parse(req.body);
    const user = await findContact(String(req.params.id));
    await db.crmEvent.create({ data: { userId: user.id, authorId: req.user!.id, text } });
    res.status(201).json(OkResponse.parse({ ok: true }));
  });
  app.patch('/api/admin/users/:id/contact', async (req, res) => {
    const { stage, followUp } = ContactUpdate.parse(req.body);
    const user = await findContact(String(req.params.id));
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { contactStage: stage, followUpAt: followUp ? new Date(followUp) : null },
      }),
      db.crmEvent.create({
        data: {
          userId: user.id,
          authorId: req.user!.id,
          text:
            'Статус контакта — ' +
            stageNames[stage] +
            '. Следующий контакт — ' +
            (followUp ?? 'не назначен') +
            '.',
        },
      }),
    ]);
    res.json(OkResponse.parse({ ok: true }));
  });
  app.patch('/api/admin/users/:id/role', requireOwner, async (req, res) => {
    const { admin } = AdminAssignment.parse(req.body),
      id = String(req.params.id);
    await db.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id, ...accounts }, select: fields });
      if (!user) throw missing();
      if (user.role === 'SUPERADMIN')
        throw new ApiError(403, 'OWNER_PROTECTED', 'Права главного администратора защищены.');
      const role = admin ? 'ADMIN' : user.subscribedAt ? 'SUBSCRIBER' : 'USER';
      if (role === user.role) return;
      const changed = await tx.user.updateMany({ where: { id, role: user.role }, data: { role } });
      if (!changed.count)
        throw new ApiError(409, 'ROLE_CHANGED', 'Права изменились. Откройте карточку заново.');
      await tx.crmEvent.create({
        data: {
          userId: id,
          authorId: req.user!.id,
          text: 'Права доступа изменены на «' + roleNames[role] + '».',
        },
      });
    });
    res.json(OkResponse.parse({ ok: true }));
  });
}
