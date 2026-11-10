import { Prisma } from '@prisma/client';
import {
  PlayablePackage,
  GameState,
  initialState,
  PlayResponse,
  RunList,
  reviewDays,
  CourseResponse,
  MaterialsResponse,
  TheoryResponse,
  theoryNotes,
  reviewSkills,
} from '@langplot/shared';
import { app } from './app.js';
import { db } from './db.js';
import { ApiError } from './errors.js';
import { requireLessonPlayer } from './guest-lesson.js';
import { requireUser } from './session.js';
import { ownedPlay, playDto } from './play-service.js';
import {
  getLesson,
  getCourse,
  courseDetails,
  readCourseHistory,
  materialInfo,
  readyLessons,
  inheritedFlags,
  lessonStudy,
} from './course-catalog.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;
async function version(content: PlayablePackage) {
  const m = content.manifest;
  const where = { packageId_version: { packageId: m.id, version: m.version } };
  const existing = await db.contentVersion.findUnique({ where });
  if (existing) return existing;
  await db.contentVersion.createMany({
    data: {
      packageId: m.id,
      version: m.version,
      language: m.language,
      level: m.level,
      status: m.status,
      data: json(content),
    },
    skipDuplicates: true,
  });
  return db.contentVersion.findUniqueOrThrow({ where });
}
async function newRun(
  userId: string,
  versionId: string,
  runNumber: number,
  content: PlayablePackage,
  reviewState?: GameState,
) {
  const lesson = [...readyLessons.values()].find(
    (l) => l.content.manifest.id === content.manifest.id,
  )!;
  const flags = await inheritedFlags(lesson, userId);
  let number = runNumber;
  while (true) {
    const key = { userId, contentVersionId: versionId, runNumber: number };
    await db.playthrough.createMany({
      data: {
        ...key,
        language: content.manifest.language,
        state: json(reviewState ?? { ...initialState(content), flags }),
      },
      skipDuplicates: true,
    });
    const saved = await db.playthrough.findUniqueOrThrow({
      where: { userId_contentVersionId_runNumber: key },
      include: { contentVersion: true },
    });
    if (Boolean(GameState.parse(saved.state).flags['review.only']) === Boolean(reviewState))
      return saved;
    number++;
  }
}
export function registerLessonRoutes() {
  app.post('/api/plays/:id/review', requireUser, async (req, res) => {
    const prev = await ownedPlay(String(req.params.id), req.user!.id);
    const lesson = [...readyLessons.values()].find(
      (l) => l.content.manifest.id === prev.contentVersion.packageId,
    );
    const bound = PlayablePackage.parse(prev.contentVersion.data),
      s = GameState.parse(prev.state);
    if (
      lesson?.number !== 90 ||
      bound.schemaVersion !== 4 ||
      !bound.scenes.some((sc) => sc.id === s.sceneId && sc.terminal)
    )
      throw new ApiError(409, 'REVIEW_LOCKED', 'Сверка журнала откроется после финала сезона.');
    const current = await version(lesson.content),
      c = PlayablePackage.parse(current.data);
    const skills = await db.skillState.findMany({
      where: { userId: prev.userId, language: prev.language, skillId: { in: reviewSkills(c) } },
      orderBy: [{ reviewDueAt: 'asc' }, { skillId: 'asc' }],
    });
    const due = skills.filter((k) => k.reviewDueAt && k.reviewDueAt <= new Date());
    const selected = (due.length ? due : skills.filter((k) => k.successes < k.attempts)).slice(
      0,
      2,
    );
    if (!selected.length)
      throw new ApiError(409, 'NO_REVIEW_ITEMS', 'В журнале пока нет ошибок для повторения.');
    const [first, ...rest] = selected.map((k) => 'review.' + k.skillId);
    const state = {
      ...initialState(c),
      flags: { ...s.flags, 'review.only': true },
      sceneId: first!,
      visited: [first!],
      reviewQueue: rest,
      journal: ['Повторение прежних записей из журнала дела.'],
    };
    const play = await newRun(prev.userId, current.id, prev.runNumber + 1, c, state);
    res.json(PlayResponse.parse({ play: playDto(play) }));
  });
  app.get('/api/courses/:language/:level', requireUser, async (req, res) => {
    const course = getCourse(String(req.params.language), String(req.params.level));
    const lessons = [...readyLessons.values()].filter((l) => l.course === course);
    res.json(
      CourseResponse.parse(courseDetails(course, await readCourseHistory(lessons, req.user!.id))),
    );
  });
  app.get('/api/materials', requireUser, async (req, res) => {
    const lessons = [...readyLessons.values()];
    const histories = await readCourseHistory(lessons, req.user!.id);
    res.json(
      MaterialsResponse.parse({
        lessons: lessons.flatMap((l) => {
          const completed = histories.get(l.content.manifest.id)?.completed;
          return completed ? [materialInfo(l, completed.content)] : [];
        }),
      }),
    );
  });
  app.get('/api/lessons/:slug/theory', requireUser, async (req, res) => {
    const lesson = getLesson(String(req.params.slug));
    const histories = await readCourseHistory([lesson], req.user!.id);
    const completed = histories.get(lesson.content.manifest.id)?.completed;
    if (!completed)
      throw new ApiError(403, 'THEORY_LOCKED', 'Теория откроется после завершения урока.');
    res.json(
      TheoryResponse.parse({
        ...materialInfo(lesson, completed.content),
        notes: theoryNotes(completed.content),
        ...lessonStudy(lesson.slug),
      }),
    );
  });
  app.post('/api/lessons/:slug/plays', requireLessonPlayer, async (req, res) => {
    const lesson = getLesson(String(req.params.slug));
    const latest = await db.playthrough.findFirst({
      where: { userId: req.user!.id, contentVersion: { packageId: lesson.content.manifest.id } },
      orderBy: [{ createdAt: 'desc' }, { runNumber: 'desc' }],
      include: { contentVersion: true },
    });
    if (latest) {
      res.json(PlayResponse.parse({ play: playDto(latest) }));
      return;
    }
    const v = await version(lesson.content);
    const play = await newRun(req.user!.id, v.id, 1, PlayablePackage.parse(v.data));
    res.json(PlayResponse.parse({ play: playDto(play) }));
  });
  app.get('/api/lessons/:slug/runs', requireLessonPlayer, async (req, res) => {
    const lesson = getLesson(String(req.params.slug));
    const plays = await db.playthrough.findMany({
      where: { userId: req.user!.id, contentVersion: { packageId: lesson.content.manifest.id } },
      orderBy: [{ createdAt: 'desc' }],
      include: { contentVersion: true },
    });
    const runs = plays.map((p) => {
      const s = GameState.parse(p.state),
        c = PlayablePackage.parse(p.contentVersion.data);
      return {
        id: p.id,
        runNumber: p.runNumber,
        finished: c.scenes.some((sc) => sc.id === s.sceneId && sc.terminal),
        decision: s.journal.at(-1) ?? null,
        ticket:
          c.schemaVersion !== 2 || s.flags[c.lesson.ticketFlag] === undefined
            ? null
            : s.flags[c.lesson.ticketFlag]
              ? 'lev'
              : 'owen',
      };
    });
    const { language, level, title } = lesson.course;
    const selectedId = typeof req.query.playId === 'string' ? req.query.playId : undefined;
    const newest = selectedId ? plays.find((p) => p.id === selectedId) : plays[0],
      flags = newest ? GameState.parse(newest.state).flags : {};
    const route = lesson.route ?? (flags['story.route-f'] ? 'F' : 'D');
    const next = [...readyLessons.values()].find(
      (l) =>
        l.course === lesson.course &&
        l.number === lesson.number + 1 &&
        (!l.route || l.route === route),
    );
    res.json(
      RunList.parse({
        runs,
        course: {
          language,
          level,
          title,
          number: lesson.number,
          nextLesson: next ? { slug: next.slug, title: next.content.manifest.title } : undefined,
        },
      }),
    );
  });
  app.post('/api/plays/:id/replay', requireUser, async (req, res) => {
    const prev = await ownedPlay(String(req.params.id), req.user!.id);
    const lesson = [...readyLessons.values()].find(
      (l) => l.content.manifest.id === prev.contentVersion.packageId,
    );
    if (!lesson) throw new ApiError(400, 'NOT_A_LESSON', 'Это не прохождение урока.');
    const bound = PlayablePackage.parse(prev.contentVersion.data);
    if (!bound.scenes.some((s) => s.terminal && s.id === GameState.parse(prev.state).sceneId))
      throw new ApiError(409, 'LESSON_IN_PROGRESS', 'Сначала завершите этот урок.');
    const current = await version(lesson.content);
    const play = await newRun(
      prev.userId,
      current.id,
      prev.runNumber + 1,
      PlayablePackage.parse(current.data),
    );
    res.json(PlayResponse.parse({ play: playDto(play) }));
  });
}

export async function recordLessonAttempt(
  tx: Prisma.TransactionClient,
  play: { id: string; userId: string; language: string },
  requestId: string,
  skillId: string,
  label: string,
  success: boolean,
  isReview: boolean,
) {
  const now = new Date(),
    observation = { skillId, outcome: success ? 'success' : 'practice', note: label };
  await tx.learningAttempt.create({
    data: {
      userId: play.userId,
      language: play.language,
      sourceId: 'lesson:' + play.id + ':' + requestId,
      observations: json([observation]),
    },
  });
  const key = { userId: play.userId, language: play.language, skillId };
  const skill = await tx.skillState.upsert({
    where: { userId_language_skillId: key },
    create: { ...key, attempts: 1, successes: success ? 1 : 0 },
    update: { attempts: { increment: 1 }, successes: { increment: success ? 1 : 0 } },
  });
  if (!success) {
    await tx.skillState.update({
      where: { id: skill.id },
      data: { reviewStage: 0, reviewDueAt: new Date(now.getTime() + 86400000) },
    });
  } else if (isReview && skill.reviewDueAt && skill.reviewDueAt <= now) {
    const stage = skill.reviewStage + 1,
      next = reviewDays[stage],
      last = reviewDays[skill.reviewStage] ?? 1;
    await tx.skillState.update({
      where: { id: skill.id },
      data: {
        reviewStage: stage,
        reviewDueAt: next ? new Date(now.getTime() + (next - last) * 86400000) : null,
      },
    });
  }
}
