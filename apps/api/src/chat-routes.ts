import { Prisma, type ChatExchange } from '@prisma/client';
import {
  ChatInput,
  ChatResponse,
  ChatResult,
  ContentPackage,
  GameState,
  MessagesResponse,
  OkResponse,
  phoneOpening,
} from '@langplot/shared';
import { createCharacterChat, DeepSeekChatProvider, LocalChatProvider } from '@langplot/agents';
import { app } from './app.js';
import { db } from './db.js';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { ownedPlay } from './play-service.js';
import { requireLessonPlayer } from './guest-lesson.js';
import { characterContext } from './chat-context.js';

const controllers = new Map<string, { attempt: number; controller: AbortController }>();
const key = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API;
const chain = createCharacterChat(
  config.CHAT_PROVIDER === 'deepseek' && key
    ? new DeepSeekChatProvider(key, config.DEEPSEEK_MODEL)
    : new LocalChatProvider(),
);
export function exchangeDto(message: ChatExchange) {
  const result = ChatResult.safeParse(message.result);
  return {
    id: message.id,
    requestId: message.requestId,
    text: message.text,
    reply: message.reply,
    replies:
      result.success && result.data.messages
        ? result.data.messages
        : message.reply
          ? [message.reply]
          : [],
    status: message.status,
    errorCode: message.errorCode,
    createdAt: message.createdAt.toISOString(),
  };
}
const json = (value: unknown) => value as Prisma.InputJsonValue;
export async function recoverChats() {
  await db.chatExchange.updateMany({
    where: { status: 'pending' },
    data: { status: 'failed', errorCode: 'INTERRUPTED' },
  });
}
export function registerChatRoutes() {
  app.get('/api/plays/:id/messages', requireLessonPlayer, async (req, res) => {
    const play = await ownedPlay(String(req.params.id), req.user!.id);
    const content = ContentPackage.parse(play.contentVersion.data);
    const opening =
      content.schemaVersion !== 1 ? phoneOpening(content, GameState.parse(play.state)) : undefined;
    if (content.schemaVersion !== 1 && !opening)
      throw new ApiError(409, 'PHONE_LOCKED', 'Переписка откроется в конце урока.');
    const messages = await db.chatExchange.findMany({
      where: { playthroughId: play.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    res.json(MessagesResponse.parse({ opening, messages: messages.reverse().map(exchangeDto) }));
  });
  app.post('/api/plays/:id/messages', requireLessonPlayer, async (req, res) => {
    const input = ChatInput.parse(req.body);
    const play = await ownedPlay(String(req.params.id), req.user!.id);
    const bound = ContentPackage.parse(play.contentVersion.data);
    const identity = { playthroughId: play.id, requestId: input.requestId };
    const claimed = await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        { state: Prisma.JsonValue; userId: string }[]
      >`SELECT state, "userId" FROM "Playthrough" WHERE id = ${play.id} FOR UPDATE`;
      if (!row || row.userId !== req.user!.id)
        throw new ApiError(404, 'PLAY_NOT_FOUND', 'Прохождение не найдено.');
      const state = GameState.parse(row.state);
      const existing = await tx.chatExchange.findUnique({
        where: { playthroughId_requestId: identity },
      });
      if (existing && existing.text !== input.text)
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Идентификатор сообщения уже использован.');
      if (existing?.status === 'completed' || existing?.status === 'pending')
        return { exchange: existing, state, run: false };
      if (bound.schemaVersion !== 1) {
        if (!phoneOpening(bound, state))
          throw new ApiError(409, 'PHONE_LOCKED', 'Переписка откроется в конце урока.');
        if (state.sceneId !== bound.lesson.phone)
          throw new ApiError(409, 'LESSON_FINISHED', 'Эта переписка завершена.');
      }
      if (config.CHAT_PROVIDER === 'none' || (config.CHAT_PROVIDER === 'deepseek' && !key))
        throw new ApiError(503, 'MODEL_NOT_CONFIGURED', 'Модель переписки не настроена.');
      if (await tx.chatExchange.findFirst({ where: { playthroughId: play.id, status: 'pending' } }))
        throw new ApiError(409, 'CHAT_BUSY', 'Собеседник ещё отвечает на предыдущее сообщение.');
      const exchange = existing
        ? await tx.chatExchange.update({
            where: { id: existing.id },
            data: { status: 'pending', errorCode: null, attempt: { increment: 1 } },
          })
        : await tx.chatExchange.create({ data: { ...identity, text: input.text } });
      return { exchange, state, run: true };
    });
    const exchange = claimed.exchange;
    if (!claimed.run) {
      res
        .status(exchange.status === 'pending' ? 202 : 200)
        .json(ChatResponse.parse({ exchange: exchangeDto(exchange) }));
      return;
    }
    const attempt = exchange.attempt;
    const controller = new AbortController();
    controllers.set(exchange.id, { attempt, controller });
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(config.CHAT_PROVIDER === 'deepseek' ? 30000 : 8000),
    ]);
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', onClose);
    try {
      const history = await db.chatExchange.findMany({
        where: { playthroughId: play.id, status: 'completed' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });
      const result = await chain.invoke(
        {
          ...characterContext(bound, claimed.state),
          history: history.reverse().map((m) => ({ text: m.text, reply: m.reply! })),
          text: input.text,
          retry: attempt > 1,
        },
        { signal, callbacks: [] },
      );
      signal.throwIfAborted();
      if (Object.keys(result.suggestedFlags).length) throw Error('UNAUTHORIZED_STATE_CHANGE');
      const allowedSkills = new Set(bound.learningObjectives.map((o) => o.id));
      if (result.observations.some((o) => !allowedSkills.has(o.skillId)))
        throw Error('UNKNOWN_SKILL');
      await db.$transaction(async (tx) => {
        // A guest may have saved the run to an account while the model was answering.
        const [current] = await tx.$queryRaw<
          { userId: string }[]
        >`SELECT "userId" FROM "Playthrough" WHERE id = ${play.id} FOR UPDATE`;
        if (!current) return;
        signal.throwIfAborted();
        const changed = await tx.chatExchange.updateMany({
          where: { id: exchange.id, status: 'pending', attempt },
          data: { status: 'completed', reply: result.reply, result: json(result), errorCode: null },
        });
        if (!changed.count) return;
        if (bound.schemaVersion === 1 || result.observations.length)
          await tx.learningAttempt.create({
            data: {
              userId: current.userId,
              language: play.language,
              sourceId: exchange.id,
              observations: json(result.observations),
            },
          });
        for (const observation of result.observations) {
          const skill = {
            userId: current.userId,
            language: play.language,
            skillId: observation.skillId,
          };
          await tx.skillState.upsert({
            where: { userId_language_skillId: skill },
            create: { ...skill, attempts: 1, successes: observation.outcome === 'success' ? 1 : 0 },
            update: {
              attempts: { increment: 1 },
              successes: { increment: observation.outcome === 'success' ? 1 : 0 },
            },
          });
        }
      });
    } catch (error) {
      const code = signal.aborted
        ? controller.signal.aborted
          ? 'CANCELLED'
          : 'TIMEOUT'
        : error instanceof Error && error.message === 'MODEL_RATE_LIMITED'
          ? 'RATE_LIMITED'
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
  app.post('/api/plays/:id/messages/:requestId/cancel', requireLessonPlayer, async (req, res) => {
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
  });
}
