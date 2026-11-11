import { describe, expect, it } from 'vitest';
import source from '../../content/lessons/last-row.json';
import { ContentPackageV2 } from '../../packages/shared/src/content';
import { initialState } from '../../packages/shared/src/engine';
import { characterContext } from '../../apps/api/src/chat-context';
describe('Character context', () => {
  it('uses the course level, correct contact and selected ticket opening', () => {
    const content = ContentPackageV2.parse(source);
    const state = {
      ...initialState(content),
      sceneId: 'phone',
      flags: { kept: true },
      visited: ['arrival', 'line-1', 'line-3', 'phone'],
    };
    const context = characterContext(content, state);
    expect(context.level).toBe('A2');
    expect(context.character?.id).toBe('mae');
    expect(context.opening).toContain('What time');
    expect(context.knownFacts.join(' ')).toContain('Read the first name');
    expect(context.knownFacts.join(' ')).not.toContain('Last stop. Is this yours?');
    expect(characterContext(content, { ...state, flags: { kept: false } }).opening).toContain(
      'Did you give',
    );
  });
  it('does not pass unseen character lines or other characters facts into the prompt', () => {
    const content = ContentPackageV2.parse(source);
    content.characters
      .find((c) => c.id === 'lev')!
      .knownFacts.push('A private fact only Lev knows.');
    content.scenes.find((s) => s.id === 'line-3')!.text = 'A later secret from Mae.';
    const context = characterContext(content, {
      ...initialState(content),
      sceneId: 'phone',
      flags: { kept: true },
      visited: ['arrival', 'phone'],
    });
    expect(context.knownFacts.join(' ')).not.toContain('private fact');
    expect(context.knownFacts.join(' ')).not.toContain('later secret');
  });
});
