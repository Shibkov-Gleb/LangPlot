import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ActionInput,
  CatalogResponse,
  ContentPackage,
  GameState,
  Language,
  PlayResponse,
  ProfileResponse,
  ProfileSettings,
  ProgressResponse,
  Selection,
  languageNames,
  levels,
  transition,
  lessonTransition,
  lessonScene,
  reviewSkills,
} from '@langplot/shared';
import { registerAccountRoutes } from './admin-routes.js';
import { app } from './app.js';
import { db } from './db.js';
import { ApiError } from './errors.js';
import { profile, requireUser } from './session.js';
import { ownedPlay, playDto } from './play-service.js';
import { recordLessonAttempt, registerLessonRoutes } from './lesson-service.js';
import { courses, readyLessons, courseDetails, readCourseHistory } from './course-catalog.js';

const json = (value: unknown) => value as Prisma.InputJsonValue;
export function registerCoreRoutes() {
  registerAccountRoutes();
  registerLessonRoutes();
  app.get('/api/catalog', async (req, res) => {
    const history = await readCourseHistory([...readyLessons.values()], req.user?.id);
    res.json(
      CatalogResponse.parse({
        worlds: Language.options.map((language) => ({
          language,
          name: languageNames[language],
          levels: levels.map((level) => {
            const course = courses.find((c) => c.language === language && c.level === level);
            if (!course) return { level, status: 'preparing' };
            const { lessons } = courseDetails(course, history);
            const first = lessons.find((l) => l.slug);
            return {
              level,
              status: first ? 'available' : 'preparing',
              course: { title: course.title, lessonCount: lessons.length },
              lesson: first
                ? {
                    slug: first.slug,
                    title: first.title,
                    started: first.status !== 'ready',
                    completed: first.theoryOpen,
                  }
                : undefined,
            };
          }),
        })),
      }),
    );
  });
  app.patch('/api/profile', requireUser, async (req, res) => {
    const settings = ProfileSettings.parse(req.body);
    const user = await db.user.update({ where: { id: req.user!.id }, data: settings });
    res.json(ProfileResponse.parse({ user: profile(user) }));
  });
  app.put('/api/profile/selection', requireUser, async (req, res) => {
    const data = Selection.parse(req.body);
    const user = await db.user.update({ where: { id: req.user!.id }, data });
    res.json(ProfileResponse.parse({ user: profile(user) }));
  });
  app.get('/api/plays/:id', requireUser, async (req, res) => {
    res.json(
      PlayResponse.parse({ play: playDto(await ownedPlay(String(req.params.id), req.user!.id)) }),
    );
  });
  app.post('/api/plays/:id/actions', requireUser, async (req, res) => {
    const input = ActionInput.parse(req.body);
    const id = String(req.params.id);
    const current = await ownedPlay(id, req.user!.id);
    const replay = await db.playEvent.findUnique({
      where: { playthroughId_requestId: { playthroughId: id, requestId: input.requestId } },
    });
    if (replay) {
      if (JSON.stringify(ActionInput.parse(replay.input)) !== JSON.stringify(input))
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Этот идентификатор уже использован для другого действия.',
        );
      res.json(PlayResponse.parse(replay.result));
      return;
    }
    if (current.revision !== input.revision)
      throw new ApiError(
        409,
        'REVISION_CONFLICT',
        'Сохранение изменилось в другой вкладке. Загрузите актуальную сцену.',
      );
    const content = ContentPackage.parse(current.contentVersion.data),
      state = GameState.parse(current.state);
    try {
      const result = await db.$transaction(async (tx) => {
        let nextState;
        let kind = 'choice';
        if (content.schemaVersion !== 1) {
          const scene = lessonScene(content, state.sceneId);
          const choice = scene?.choices.find((c) => c.id === input.choiceId);
          if (!scene || !choice)
            throw new ApiError(400, 'INVALID_CHOICE', 'Этот выбор недоступен в текущей сцене.');
          const hasExchange =
            scene.layout !== 'phone' ||
            !!(await tx.chatExchange.findFirst({
              where: { playthroughId: id, status: 'completed' },
              select: { id: true },
            }));
          if (!hasExchange)
            throw new ApiError(409, 'CHAT_REQUIRED', 'Сначала ответьте собеседнику.');
          const due =
            choice.target === content.lesson.gate && !state.reviewQueue
              ? await tx.skillState.findMany({
                  where: {
                    userId: current.userId,
                    language: current.language,
                    skillId: {
                      in: reviewSkills(content),
                    },
                    reviewDueAt: { lte: new Date() },
                  },
                  orderBy: [{ reviewDueAt: 'asc' }, { skillId: 'asc' }],
                  take: 2,
                })
              : [];
          try {
            nextState = lessonTransition(
              content,
              state,
              input.choiceId,
              due.map((s) => s.skillId),
              hasExchange,
            );
          } catch {
            throw new ApiError(400, 'INVALID_CHOICE', 'Этот выбор недоступен в текущей сцене.');
          }
          if (scene.exercise) {
            kind = scene.exercise.review ? 'review' : 'exercise';
            await recordLessonAttempt(
              tx,
              current,
              input.requestId,
              scene.exercise.skill,
              choice.label,
              choice.id === scene.exercise.correct,
              scene.exercise.review,
            );
          }
        } else {
          try {
            nextState = transition(content, state, input.choiceId);
          } catch {
            throw new ApiError(400, 'INVALID_CHOICE', 'Этот выбор недоступен в текущей сцене.');
          }
        }
        const updated = await tx.playthrough.updateMany({
          where: { id, userId: req.user!.id, revision: input.revision },
          data: { state: json(nextState), revision: { increment: 1 } },
        });
        if (updated.count !== 1)
          throw new ApiError(
            409,
            'REVISION_CONFLICT',
            'Сохранение уже изменилось. Загрузите актуальную сцену.',
          );
        const saved = await tx.playthrough.findUniqueOrThrow({
          where: { id },
          include: { contentVersion: true },
        });
        const result = PlayResponse.parse({ play: playDto(saved) });
        await tx.playEvent.create({
          data: {
            playthroughId: id,
            requestId: input.requestId,
            kind,
            fromScene: state.sceneId,
            toScene: nextState.sceneId,
            terminal: content.scenes.some((s) => s.id === nextState.sceneId && s.terminal),
            correct:
              content.schemaVersion !== 1 && lessonScene(content, state.sceneId)?.exercise
                ? lessonScene(content, state.sceneId)!.exercise!.correct === input.choiceId
                : null,
            input: json(input),
            result: json(result),
          },
        });
        return result;
      });
      res.json(result);
    } catch (error) {
      const retry = await db.playEvent.findUnique({
        where: { playthroughId_requestId: { playthroughId: id, requestId: input.requestId } },
      });
      if (retry && JSON.stringify(ActionInput.parse(retry.input)) === JSON.stringify(input)) {
        res.json(PlayResponse.parse(retry.result));
        return;
      }
      throw error;
    }
  });
  app.get('/api/progress', requireUser, async (req, res) => {
    const language = Language.parse(req.query.language ?? req.user!.language);
    const [technicalAttempts, skills] = await Promise.all([
      db.learningAttempt.count({
        where: { userId: req.user!.id, language, NOT: { sourceId: { startsWith: 'lesson:' } } },
      }),
      db.skillState.findMany({
        where: { userId: req.user!.id, language },
        select: { skillId: true, successes: true, attempts: true },
      }),
    ]);
    const objectiveNames = new Map(
      [...readyLessons.values()]
        .filter((l) => l.course.language === language)
        .flatMap((l) => l.content.learningObjectives.map((o) => [o.id, o.description] as const)),
    );
    res.json(
      ProgressResponse.parse({
        technicalAttempts,
        skills: skills.map((s) => ({
          ...s,
          description: objectiveNames.get(s.skillId),
        })),
        publishedCourses: new Set(
          [...readyLessons.values()]
            .filter((l) => l.course.language === language)
            .map((l) => l.course.level),
        ).size,
      }),
    );
  });
}
