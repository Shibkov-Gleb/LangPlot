import { RunnableLambda } from '@langchain/core/runnables';
import { setTimeout as delay } from 'node:timers/promises';
import { ChatResult } from '@langplot/shared';
export interface ChatContext {
  language: 'en' | 'de';
  scene: { id: string; text: string };
  knownFacts: string[];
  history: { text: string; reply: string }[];
  text: string;
  retry: boolean;
  level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  character?: { id: string; name: string; role: string };
  opening?: string;
  topic?: string;
  referenceReply?: string;
}
export interface ChatProvider {
  readonly name: string;
  respond(context: ChatContext, signal?: AbortSignal): Promise<ChatResult>;
}
export class LocalChatProvider implements ChatProvider {
  readonly name = 'local-deterministic';
  async respond(context: ChatContext, signal?: AbortSignal): Promise<ChatResult> {
    await delay(context.text === '/timeout' && !context.retry ? 15000 : 650, undefined, { signal });
    if (context.text === '/error' && !context.retry) throw new Error('PROVIDER_UNAVAILABLE');
    const greeting = /^(hi|hello|hey|hallo|guten tag)[!.\s]*$/i.test(context.text);
    if (context.referenceReply)
      return {
        reply: context.referenceReply,
        messages: [context.referenceReply],
        intent: greeting ? 'greeting' : 'message',
        observations: [],
        suggestedFlags: {},
      };
    return {
      reply:
        context.language === 'de'
          ? greeting
            ? 'Hallo! Deine Nachricht ist angekommen. Dies ist ein technischer Test.'
            : 'Danke! Deine Nachricht wurde gespeichert. Das Gespräch ist ein lokaler Test, keine Sprachbewertung.'
          : greeting
            ? 'Hello! Your message has arrived. This is a technical test.'
            : 'Thank you! Your message has been saved. This conversation is a local test, not a language assessment.',
      intent: greeting ? 'greeting' : context.text.includes('?') ? 'question' : 'message',
      observations: [],
      suggestedFlags: {},
    };
  }
}
export function createCharacterChat(provider: ChatProvider) {
  return RunnableLambda.from<ChatContext, ChatContext>((input) => ({
    ...input,
    scene: { id: input.scene.id, text: input.scene.text.slice(0, 2000) },
    knownFacts: input.knownFacts.slice(0, 20),
    history: input.history
      .slice(-10)
      .map((m) => ({ text: m.text.slice(0, 1000), reply: m.reply.slice(0, 1000) })),
  })).pipe(
    RunnableLambda.from<ChatContext, ChatResult>(async (context, config) =>
      ChatResult.parse(await provider.respond(context, config?.signal)),
    ),
  );
}
