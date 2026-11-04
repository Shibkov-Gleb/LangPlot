import { describe, expect, it } from 'vitest';
import { createCharacterChat, LocalChatProvider, type ChatContext } from './chat.js';
import { createCourseGraph, LocalCourseProvider } from './course.js';
process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
const context: ChatContext = {
  language: 'en',
  scene: { id: 'test', text: 'Technical scene' },
  knownFacts: ['Technical only'],
  history: [],
  text: 'Hello',
  retry: false,
};
describe('offline agents', () => {
  it('returns deterministic structured responses without inventing grades', async () => {
    const result = await createCharacterChat(new LocalChatProvider()).invoke(context, {
      callbacks: [],
    });
    expect(result.intent).toBe('greeting');
    expect(result.observations).toEqual([]);
    expect(result.suggestedFlags).toEqual({});
  });
  it('bounds history and forwards cancellation', async () => {
    const chain = createCharacterChat({
      name: 'test',
      respond: async (input) => {
        expect(input.history).toHaveLength(10);
        expect(input.scene.text.length).toBe(2000);
        return { reply: 'ok', intent: 'message', observations: [], suggestedFlags: {} };
      },
    });
    await chain.invoke(
      {
        ...context,
        scene: { id: 's', text: 'x'.repeat(4000) },
        history: Array.from({ length: 30 }, () => ({ text: 't', reply: 'r' })),
      },
      { callbacks: [] },
    );
    const abort = new AbortController();
    abort.abort();
    await expect(
      createCharacterChat(new LocalChatProvider()).invoke(context, {
        signal: abort.signal,
        callbacks: [],
      }),
    ).rejects.toThrow();
  });
  it('runs all graph stages and exports an unpublished empty skeleton', async () => {
    const stages: string[] = [];
    const graph = createCourseGraph(new LocalCourseProvider(), async (s) => {
      stages.push(s);
    });
    const result = await graph.invoke(
      {
        input: {
          brief: 'Prepare only a neutral skeleton',
          language: 'de',
          level: 'B1',
          packageId: 'test.draft',
        },
      },
      { callbacks: [] },
    );
    expect(stages).toEqual(['brief', 'structure', 'validation', 'report', 'export']);
    expect(result.draft.scenes).toEqual([]);
    expect(result.report.valid).toBe(true);
    expect(result.report.publishable).toBe(false);
    expect(JSON.parse(result.exported)).toEqual(result.draft);
  });
});
