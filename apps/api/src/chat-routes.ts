import { Prisma } from '@prisma/client';
import type { ChatExchange } from '@prisma/client';
import {
  ChatInput,
  ChatResponse,
  ContentPackage,
  GameState,
  MessagesResponse,
  OkResponse,
  phoneOpening,
  lessonContact,
} from '@langplot/shared';
import { createCharacterChat, LocalChatProvider } from '@langplot/agents';
import { app } from './app.js';
import { db } from './db.js';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { ownedPlay } from './play-service.js';
import { requireLocal, requireUser } from './session.js';
const controllers = new Map<string, { attempt: number; controller: AbortController }>();
const chain = createCharacterChat(new LocalChatProvider());
export const exchangeDto = (m: ChatExchange) => ({
  id: m.id,
  requestId: m.requestId,
  text: m.text,
  reply: m.reply,
  status: m.status,
  errorCode: m.errorCode,
  createdAt: m.createdAt.toISOString(),
});
const json = (value: unknown) => value as Prisma.InputJsonValue;
export async function recoverChats() {
  await db.chatExchange.updateMany({
    where: { status: 'pending' },
    data: { status: 'failed', errorCode: 'INTERRUPTED' },
  });
}
export function registerChatRoutes() {
  app.get('/api/plays/:id/messages', requireUser, async (req, res) => {
    const play = await ownedPlay(String(req.params.id), req.user!.id);
    const content = ContentPackage.parse(play.contentVersion.data);
    const opening =
      content.schemaVersion !== 1 ? phoneOpening(content, GameState.parse(play.state)) : undefined;
    if (content.schemaVersion !== 1 && !opening)
      throw new ApiError(409, 'PHONE_LOCKED', 'Переписка откроется в конце урока.');
    const messages = await db.chatExchange.findMany({
      where: { playthroughId: play.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(MessagesResponse.parse({ opening, messages: messages.reverse().map(exchangeDto) }));
  });
  app.post('/api/plays/:id/messages', requireLocal, requireUser, async (req, res) => {
    const input = ChatInput.parse(req.body);
    const play = await ownedPlay(String(req.params.id), req.user!.id);
    const key = { playthroughId: play.id, requestId: input.requestId };
    const bound = ContentPackage.parse(play.contentVersion.data);
    if (bound.schemaVersion !== 1) {
      const saved = await db.$transaction(async (tx) => {
        // Serialize a send with the action that closes the phone.
        const [row] = await tx.$queryRaw<
          { state: Prisma.JsonValue }[]
        >`SELECT state FROM "Playthrough" WHERE id = ${play.id} FOR UPDATE`;
        const state = GameState.parse(row?.state);
        if (!phoneOpening(bound, state))
          throw new ApiError(409, 'PHONE_LOCKED', 'Переписка откроется в конце урока.');
        const existing = await tx.chatExchange.findUnique({
          where: { playthroughId_requestId: key },
        });
        if (existing) {
          if (existing.text !== input.text)
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'Идентификатор сообщения уже использован.',
            );
          return existing;
        }
        if (state.sceneId !== bound.lesson.phone)
          throw new ApiError(409, 'LESSON_FINISHED', 'Эта переписка завершена.');
        return tx.chatExchange.create({
          data: {
            ...key,
            text: input.text,
            reply:
              bound.schemaVersion === 2 ? bound.lesson.reply : lessonContact(bound, state)!.reply,
            status: 'completed',
          },
        });
      });
      res.json(ChatResponse.parse({ exchange: exchangeDto(saved) }));
      return;
    }
    if (config.CHAT_PROVIDER === 'none')
      throw new ApiError(503, 'MODEL_NOT_CONFIGURED', 'Модель переписки не настроена.');
    let exchange = await db.chatExchange.findUnique({ where: { playthroughId_requestId: key } });
    let retry = false;
    if (exchange) {
      if (exchange.text !== input.text)
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Идентификатор сообщения уже использован.');
      if (exchange.status === 'completed' || exchange.status === 'pending') {
        res
          .status(exchange.status === 'pending' ? 202 : 200)
          .json(ChatResponse.parse({ exchange: exchangeDto(exchange) }));
        return;
      }
      retry = true;
      const claim = await db.chatExchange.updateMany({
        where: {
          id: exchange.id,
          status: { in: ['failed', 'cancelled'] },
          attempt: exchange.attempt,
        },
        data: { status: 'pending', errorCode: null, attempt: { increment: 1 } },
      });
      if (!claim.count) {
        res.status(202).json(
          ChatResponse.parse({
            exchange: exchangeDto(
              await db.chatExchange.findUniqueOrThrow({ where: { id: exchange.id } }),
            ),
          }),
        );
        return;
      }
      exchange = { ...exchange, attempt: exchange.attempt + 1, status: 'pending', errorCode: null };
    } else {
      try {
        exchange = await db.chatExchange.create({ data: { ...key, text: input.text } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await db.chatExchange.findUniqueOrThrow({
            where: { playthroughId_requestId: key },
          });
          if (existing.text !== input.text)
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'Идентификатор сообщения уже использован.',
            );
          res.status(202).json(ChatResponse.parse({ exchange: exchangeDto(existing) }));
          return;
        }
        throw error;
      }
    }
    const attempt = exchange.attempt;
    const controller = new AbortController();
    if ((controllers.get(exchange.id)?.attempt ?? 0) <= attempt)
      controllers.set(exchange.id, { attempt, controller });
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', onClose);
    try {
      const content = ContentPackage.parse(play.contentVersion.data);
      const state = GameState.parse(play.state);
      const scene = content.scenes.find((s) => s.id === state.sceneId);
      if (!scene) throw new Error('SCENE_NOT_FOUND');
      const history = await db.chatExchange.findMany({
        where: { playthroughId: play.id, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const result = await chain.invoke(
        {
          language: content.manifest.language,
          scene: { id: scene.id, text: scene.text },
          knownFacts: content.characters[0]?.knownFacts ?? [],
          history: history.reverse().map((m) => ({ text: m.text, reply: m.reply! })),
          text: input.text,
          retry,
        },
        { signal, callbacks: [] },
      );
      signal.throwIfAborted();
      // Model output is evidence, never an authority to mutate a story.
      if (Object.keys(result.suggestedFlags).length) throw new Error('UNAUTHORIZED_STATE_CHANGE');
      const allowedSkills = new Set(content.learningObjectives.map((o) => o.id));
      if (result.observations.some((o) => !allowedSkills.has(o.skillId)))
        throw new Error('UNKNOWN_SKILL');
      await db.$transaction(async (tx) => {
        const changed = await tx.chatExchange.updateMany({
          where: { id: exchange!.id, status: 'pending', attempt },
          data: { status: 'completed', reply: result.reply, result: json(result), errorCode: null },
        });
        if (!changed.count) return;
        await tx.learningAttempt.create({
          data: {
            userId: req.user!.id,
            language: play.language,
            sourceId: exchange!.id,
            observations: json(result.observations),
          },
        });
        for (const observation of result.observations)
          await tx.skillState.upsert({
            where: {
              userId_language_skillId: {
                userId: req.user!.id,
                language: play.language,
                skillId: observation.skillId,
              },
            },
            create: {
              userId: req.user!.id,
              language: play.language,
              skillId: observation.skillId,
              attempts: 1,
              successes: observation.outcome === 'success' ? 1 : 0,
            },
            update: {
              attempts: { increment: 1 },
              successes: { increment: observation.outcome === 'success' ? 1 : 0 },
            },
          });
      });
    } catch (error) {
      const code = signal.aborted
        ? controller.signal.aborted
          ? 'CANCELLED'
          : 'TIMEOUT'
        : 'PROVIDER_UNAVAILABLE';
      await db.chatExchange.updateMany({
        where: { id: exchange.id, status: 'pending', attempt },
        data: { status: code === 'CANCELLED' ? 'cancelled' : 'failed', errorCode: code },
      });
    } finally {
      if (controllers.get(exchange.id)?.attempt === attempt) controllers.delete(exchange.id);
      res.off('close', onClose);
    }
    const saved = await db.chatExchange.findUniqueOrThrow({ where: { id: exchange.id } });
    if (!res.destroyed) res.json(ChatResponse.parse({ exchange: exchangeDto(saved) }));
  });
  app.post(
    '/api/plays/:id/messages/:requestId/cancel',
    requireLocal,
    requireUser,
    async (req, res) => {
      const play = await ownedPlay(String(req.params.id), req.user!.id);
      const exchange = await db.chatExchange.findUnique({
        where: {
          playthroughId_requestId: {
            playthroughId: play.id,
            requestId: String(req.params.requestId),
          },
        },
      });
      if (!exchange) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Сообщение не найдено.');
      const cancelled = await db.chatExchange.updateMany({
        where: { id: exchange.id, status: 'pending', attempt: exchange.attempt },
        data: { status: 'cancelled', errorCode: 'CANCELLED' },
      });
      if (cancelled.count && controllers.get(exchange.id)?.attempt === exchange.attempt)
        controllers.get(exchange.id)?.controller.abort();
      res.json(OkResponse.parse({ ok: true }));
    },
  );
}
