import { lessonContact, phoneOpening, type ContentPackage, type GameState } from '@langplot/shared';
import type { ChatContext } from '@langplot/agents';

export function characterContext(
  content: ContentPackage,
  state: GameState,
): Omit<ChatContext, 'text' | 'retry' | 'history'> {
  const scene = content.scenes.find((s) => s.id === state.sceneId)!;
  if (content.schemaVersion === 1)
    return {
      language: content.manifest.language,
      level: content.manifest.level,
      scene: { id: scene.id, text: scene.text },
      knownFacts: content.characters[0]?.knownFacts ?? [],
    };
  const contact = lessonContact(content, state);
  const phoneScene = content.scenes.find((s) => s.id === content.lesson.phone)!;
  const character = content.characters.find((c) => c.id === (contact?.id ?? phoneScene.speakerId));
  const opening = phoneOpening(content, state)!;
  const referenceReply = content.schemaVersion === 2 ? content.lesson.reply : contact!.reply;
  const ownLines = content.scenes
    .filter(
      (s) =>
        !!character &&
        state.visited.includes(s.id) &&
        s.layout === 'line' &&
        s.speakerId === character.id,
    )
    .map((s) => s.text);
  const topic = contact?.context ?? phoneScene.text;
  return {
    language: content.manifest.language,
    level: content.manifest.level,
    character: {
      id: character?.id ?? 'contact',
      name: character?.name ?? 'Собеседник',
      role: contact?.role ?? 'Собеседник',
    },
    scene: { id: phoneScene.id, text: topic },
    topic,
    opening,
    referenceReply,
    knownFacts: [
      'The current conversation starts with: ' + opening,
      'An authored reply for this situation: ' + referenceReply,
      ...(character?.knownFacts ?? []),
      ...ownLines,
    ].slice(0, 20),
  };
}
