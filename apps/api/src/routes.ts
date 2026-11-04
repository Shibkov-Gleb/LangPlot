import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ActionInput, CatalogResponse, ContentPackage, GameState, Language, PlayResponse, ProfileResponse, ProfileSettings, ProgressResponse, Selection, fixtureFor, initialState, languageNames, levels, transition } from '@langplot/shared';
import { app } from './app.js';
import { db } from './db.js';
import { ApiError } from './errors.js';
import { profile, requireLocal, requireUser } from './session.js';

const json = (value: unknown) => value as Prisma.InputJsonValue;
export async function ownedPlay(id: string, userId: string) {
  const play = await db.playthrough.findFirst({ where: { id, userId }, include: { contentVersion: true } });
  if (!play) throw new ApiError(404, 'PLAY_NOT_FOUND', 'Прохождение не найдено.');
  return play;
}
export function playDto(play: Awaited<ReturnType<typeof ownedPlay>>) {
  return { id: play.id, language: play.language, revision: play.revision, contentVersion: `${play.contentVersion.packageId}@${play.contentVersion.version}`, state: play.state };
}
export function registerCoreRoutes() {
  app.get('/api/catalog', (_req, res) => res.json(CatalogResponse.parse({ worlds: Language.options.map(language => ({ language, name: languageNames[language], levels: levels.map(level => ({ level, status: 'preparing' })) })) })));
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
  app.post('/api/plays/technical', requireLocal, requireUser, async (req, res) => {
    const { language } = z.object({ language: Language }).strict().parse(req.body);
    const fixture = fixtureFor(language);
    const version = await db.contentVersion.upsert({ where: { packageId_version: { packageId: fixture.manifest.id, version: fixture.manifest.version } }, update: {}, create: { packageId: fixture.manifest.id, version: fixture.manifest.version, language, level: 'A1', status: 'technical', data: json(fixture) } });
    const play = await db.playthrough.upsert({ where: { userId_contentVersionId: { userId: req.user!.id, contentVersionId: version.id } }, update: {}, create: { userId: req.user!.id, language, contentVersionId: version.id, state: json(initialState(fixture)) }, include: { contentVersion: true } });
    res.json(PlayResponse.parse({ play: playDto(play) }));
  });
  app.get('/api/plays/:id', requireUser, async (req, res) => {
    res.json(PlayResponse.parse({ play: playDto(await ownedPlay(String(req.params.id), req.user!.id)) }));
  });
  app.post('/api/plays/:id/actions', requireUser, async (req, res) => {
    const input = ActionInput.parse(req.body);
    const id = String(req.params.id);
    const current = await ownedPlay(id, req.user!.id);
    const replay = await db.playEvent.findUnique({ where: { playthroughId_requestId: { playthroughId: id, requestId: input.requestId } } });
    if (replay) {
      if (JSON.stringify(replay.input) !== JSON.stringify(json(input))) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Этот идентификатор уже использован для другого действия.');
      res.json(PlayResponse.parse(replay.result)); return;
    }
    if (current.revision !== input.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Сохранение изменилось в другой вкладке. Загрузите актуальную сцену.');
    let nextState;
    try { nextState = transition(ContentPackage.parse(current.contentVersion.data), GameState.parse(current.state), input.choiceId); }
    catch { throw new ApiError(400, 'INVALID_CHOICE', 'Этот выбор недоступен в текущей сцене.'); }
    try {
      const result = await db.$transaction(async tx => {
        const updated = await tx.playthrough.updateMany({ where: { id, userId: req.user!.id, revision: input.revision }, data: { state: json(nextState), revision: { increment: 1 } } });
        if (updated.count !== 1) throw new ApiError(409, 'REVISION_CONFLICT', 'Сохранение уже изменилось. Загрузите актуальную сцену.');
        const result = PlayResponse.parse({ play: { ...playDto(current), state: nextState, revision: current.revision + 1 } });
        await tx.playEvent.create({ data: { playthroughId: id, requestId: input.requestId, kind: 'choice', input: json(input), result: json(result) } });
        return result;
      });
      res.json(result);
    } catch (error) {
      const retry = await db.playEvent.findUnique({ where: { playthroughId_requestId: { playthroughId: id, requestId: input.requestId } } });
      if (retry && JSON.stringify(retry.input) === JSON.stringify(json(input))) { res.json(PlayResponse.parse(retry.result)); return; }
      throw error;
    }
  });
  app.get('/api/progress', requireUser, async (req, res) => {
    const language = Language.parse(req.query.language ?? req.user!.language);
    const [technicalAttempts, skills] = await Promise.all([
      db.learningAttempt.count({ where: { userId: req.user!.id, language } }),
      db.skillState.findMany({ where: { userId: req.user!.id, language }, select: { skillId: true, successes: true, attempts: true } })
    ]);
    res.json(ProgressResponse.parse({ technicalAttempts, skills, publishedCourses: 0 }));
  });
}
