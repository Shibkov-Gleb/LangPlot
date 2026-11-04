import { describe, expect, it } from 'vitest';
import { ContentPackage, createDraft, validatePackage } from './content.js';
import { fixtureFor, initialState, transition } from './engine.js';

describe('declarative state engine', () => {
  it('preserves branching flags and journal without mutating old state', () => {
    const p = fixtureFor('en');
    const before = initialState(p);
    const after = transition(p, before, 'observe');
    expect(after.sceneId).toBe('review');
    expect(after.flags.observed).toBe(true);
    expect(before.flags).toEqual({});
    expect(after.journal).toHaveLength(1);
    expect(() => transition(p, after, 'observe')).toThrow('INVALID_CHOICE');
    expect(transition(p, after, 'finish').sceneId).toBe('end');
  });
  it('enforces declared conditions', () => {
    const p = structuredClone(fixtureFor('de'));
    p.scenes[0]!.choices[0]!.condition = { flag: 'unlocked', equals: true };
    expect(() => transition(p, initialState(p), 'observe')).toThrow();
    expect(
      transition(p, { ...initialState(p), flags: { unlocked: true } }, 'observe').sceneId,
    ).toBe('review');
  });
});
describe('content packages', () => {
  it('accepts an empty draft, refuses publication', () => {
    const draft = createDraft('A neutral drafting brief', 'en', 'A1', 'draft.example');
    expect(validatePackage(draft).valid).toBe(true);
    expect(validatePackage(draft, 'publish').valid).toBe(false);
  });
  it('rejects duplicate ids, missing references and unreachable scenes', () => {
    const p = structuredClone(fixtureFor('en'));
    p.scenes.push({ ...p.scenes[2]!, id: 'orphan' });
    p.scenes[0]!.choices[0]!.target = 'missing';
    p.characters.push(p.characters[0]!);
    const r = validatePackage(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('недостижима'))).toBe(true);
    expect(r.errors.some((e) => e.includes('цель перехода'))).toBe(true);
    expect(r.errors.some((e) => e.includes('уникальными'))).toBe(true);
  });
  it.each([
    '../secret.png',
    'assets/../../secret.png',
    'https://example.org/a.png',
    'C:/a.png',
    'assets/a.svg',
    'assets/a.js',
    'assets//a.png',
    'assets/%2e%2e/a.png',
  ])('rejects unsafe asset %s', (path) => {
    const p = createDraft('test draft', 'en', 'A1', 'draft.safe');
    p.resources = [{ id: 'test', path, mediaType: 'image' }];
    expect(validatePackage(p).valid).toBe(false);
  });
  it('rejects arbitrary executable conditions and unrecognized fields', () => {
    const p = structuredClone(fixtureFor('en'));
    (p.scenes[0]!.choices[0] as unknown as Record<string, unknown>).condition = {
      script: 'process.exit()',
    };
    expect(ContentPackage.safeParse(p).success).toBe(false);
  });
  it('requires verified resources before publication', () => {
    const p = structuredClone(fixtureFor('en'));
    p.manifest.status = 'draft';
    p.learningObjectives = [{ id: 'test.skill', description: 'Test learning objective' }];
    expect(validatePackage(p, 'publish').valid).toBe(true);
    p.resources = [{ id: 'image', path: 'assets/scene.webp', mediaType: 'image' }];
    expect(validatePackage(p, 'publish').valid).toBe(false);
  });
});
