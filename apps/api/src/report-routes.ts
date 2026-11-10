import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CrmFilter, ReportFilter, stageNames, roleNames, moscowDay } from '@langplot/shared';
import { app } from './app.js';
import { db } from './db.js';

import { ApiError } from './errors.js';
import {
  overview,
  lessonReport,
  measure,
  segmentIds,
  snapshot,
  type Tx,
} from './report-service.js';

export async function studentQuery(
  tx: Tx,
  q: CrmFilter,
  now: Date,
): Promise<Prisma.UserWhereInput> {
  const ids = await segmentIds(tx, q, now),
    term = { contains: q.search, mode: 'insensitive' as const };
  return {
    email: { not: null },
    demoKey: null,
    role: q.role,
    contactStage: q.stage,
    ...(ids && { id: { in: ids } }),
    ...(q.due && { followUpAt: { lte: new Date(moscowDay(now)) } }),
    ...(q.search && { OR: [{ email: term }, { name: term }] }),
  };
}
type Cell = string | number | null;
export function csv(headers: string[], rows: Cell[][]) {
  function quote(value: Cell) {
    let s = String(value ?? '');
    if (typeof value === 'string' && /^[\s\uFEFF]*[=+@\-＝＋＠－]|^[\t\r\n]/u.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(quote).join(';')).join('\r\n') + '\r\n';
}
const kind = z.enum(['cohorts', 'lessons', 'scenes', 'students', 'contacts']);
type Kind = z.infer<typeof kind>;
const prepared = new Map<
  string,
  { user: string; kind: Kind; id: string; file: string; count: number; until: number }
>();
async function exportData(tx: Tx, type: Kind, input: unknown, now: Date) {
  if (type === 'students' || type === 'contacts') {
    const q = CrmFilter.parse(input),
      where = await studentQuery(tx, q, now);
    const users = await tx.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        name: type === 'contacts',
        email: type === 'contacts',
        role: true,
        contactStage: true,
        followUpAt: true,
        createdAt: true,
        language: true,
        level: true,
      },
    });
    return {
      period: q.from || q.to ? [q.from ?? '…', q.to ?? '…'].join(' — ') : 'Весь период',
      columns: [
        'ID ученика',
        ...(type === 'contacts' ? ['Имя', 'Почта'] : []),
        'Дата регистрации',
        'Доступ',
        'Контакт',
        'Следующий контакт',
        'Язык',
        'Уровень',
      ],
      rows: users.map((u) => [
        u.id,
        ...(type === 'contacts' ? [u.name, u.email] : []),
        moscowDay(u.createdAt),
        roleNames[u.role],
        stageNames[u.contactStage],
        u.followUpAt?.toISOString().slice(0, 10) ?? '',
        u.language,
        u.level,
      ]),
    };
  }
  const q = ReportFilter.parse(input);
  const { period } = await import('./report-service.js');
  const span = period(q, now),
    label = span.from + ' — ' + span.to;
  if (type === 'cohorts') {
    const r = await overview(tx, q, now);
    const groups = new Map<string, typeof r.people>();
    for (const p of r.people) {
      const list = groups.get(p.day) ?? [];
      list.push(p);
      groups.set(p.day, list);
    }
    return {
      period: label,
      columns: [
        'Когорта (МСК)',
        'Показатель',
        'Числитель',
        'Знаменатель',
        'Процент',
        'Окно открыто',
        'Статус',
      ],
      rows: [...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([day, people]) =>
          measure(people, now, r.payments).map((m) => [
            day,
            m.label,
            m.enabled ? m.count : null,
            m.enabled ? m.base : null,
            m.enabled && m.base ? Number(((100 * m.count) / m.base).toFixed(2)) : null,
            m.pending,
            m.enabled ? 'Сбор включён' : 'Нет сбора оплат',
          ]),
        ),
    };
  }
  const report = await lessonReport(tx, q, now);
  if (type === 'scenes')
    return {
      period: label,
      columns: ['Сцена', 'Реплика', 'Ученики', 'Действия', 'Ошибки'],
      rows: report.scenes.map((s) => [s.id, s.text, s.people, s.actions, s.mistakes]),
    };
  return {
    period: label,
    columns: ['Урок', 'Название', 'Начали', 'Завершили', 'Перешли дальше', 'Повторы'],
    rows: report.lessons.map((l) => [
      l.number,
      l.title,
      l.started,
      l.finished,
      l.continued,
      l.replays,
    ]),
  };
}
export function reportRoutes() {
  app.get('/api/admin/reports/overview', async (req, res) =>
    res.json(
      await snapshot(
        async (tx) => (await overview(tx, ReportFilter.parse(req.query), new Date())).data,
      ),
    ),
  );
  app.get('/api/admin/reports/lessons', async (req, res) =>
    res.json(await snapshot((tx) => lessonReport(tx, ReportFilter.parse(req.query), new Date()))),
  );
  app.post('/api/admin/exports', async (req, res) => {
    const { type, filters } = z
      .object({ type: kind, filters: z.record(z.string()) })
      .strict()
      .parse(req.body);
    if (type === 'contacts' && req.user!.role !== 'SUPERADMIN')
      throw new ApiError(
        403,
        'OWNER_REQUIRED',
        'Выгрузка контактов доступна главному администратору.',
      );
    const now = new Date(),
      r = await snapshot((tx) => exportData(tx, type, filters, now)),
      id = randomUUID();
    for (const [key, v] of prepared)
      if (v.until < Date.now() || v.user === req.user!.id) prepared.delete(key);
    prepared.set(id, {
      id,
      user: req.user!.id,
      kind: type,
      count: r.rows.length,
      file: csv(r.columns, r.rows),
      until: Date.now() + 120000,
    });
    setTimeout(() => prepared.delete(id), 120000).unref();
    res.json({ id, period: r.period, count: r.rows.length, columns: r.columns });
  });
  app.get('/api/admin/exports/:id', async (req, res) => {
    const p = prepared.get(String(req.params.id));
    if (!p || p.user !== req.user!.id || p.until < Date.now())
      throw new ApiError(404, 'EXPORT_EXPIRED', 'Подготовьте выгрузку заново.');
    if (p.kind === 'contacts') {
      if (req.user!.role !== 'SUPERADMIN')
        throw new ApiError(403, 'OWNER_REQUIRED', 'Недостаточно прав.');
      await db.contactExport.create({ data: { authorId: req.user!.id, rows: p.count } });
    }
    res
      .attachment('langplot-' + p.kind + '-' + moscowDay(new Date()) + '.csv')
      .type('text/csv; charset=utf-8')
      .send(p.file);
  });
}
