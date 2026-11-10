import { describe, expect, it } from 'vitest';
import source from '../../../content/lessons/last-row.json';
import { ContentPackageV2, validatePackage } from './content';
import { initialState } from './engine';
import { lessonTransition, lessonView, phoneOpening } from './lesson-engine';
const c = ContentPackageV2.parse(source);
describe('Последний ряд', () => {
  it('validates all references and the fourteen terms on the poster', () => {
    expect(validatePackage(source).valid).toBe(true);
    const marks = c.scenes
      .filter((s) => s.layout === 'reading')
      .flatMap((s) => s.marks.map((m) => m.note));
    expect(new Set(marks).size).toBe(14);
    const broken = structuredClone(source);
    broken.scenes.find((s) => s.id === 'poster-1')!.marks![0]!.text = 'absent';
    expect(validatePackage(broken).valid).toBe(false);
  });
  it.each([
    ['keep', true],
    ['give', false],
  ] as const)('plays every beat on the %s branch', (choice, kept) => {
    let state = initialState(c);
    const step = (id: string, due: string[] = [], exchanged = false) => {
      state = lessonTransition(c, state, id, due, exchanged);
    };
    step('next');
    for (let i = 1; i <= 9; i++) {
      expect(state.sceneId).toBe('line-' + i);
      step('next');
    }
    step('option-1');
    expect(state.sceneId).toBe('grammar');
    expect(state.feedback).toContain('right now');
    step('option-2');
    expect(lessonView(c, state).notes[0]?.kind).toBe('grammar');
    step('next');
    step(choice);
    expect(state.flags.kept).toBe(kept);
    expect(state.journal).toHaveLength(1);
    while (!state.sceneId.startsWith('word-')) step('next');
    for (let i = 1; i <= 6; i++) {
      expect(phoneOpening(c, state)).toBeUndefined();
      const task = c.scenes.find((s) => s.id === state.sceneId)!.exercise!;
      step(task.correct, ['g04', 'v15.02', 'v15.04']);
    }
    expect(state.sceneId).toBe('review-g04');
    step('option-2');
    expect(state.sceneId).toBe('review-g04');
    step('option-1');
    expect(state.sceneId).toBe('review-1');
    step('option-2');
    expect(state.sceneId).toBe('phone');
    expect(phoneOpening(c, state)).toBe(kept ? c.lesson.keptOpening : c.lesson.givenOpening);
    expect(() => step('finish')).toThrow('INVALID_CHOICE');
    step('finish', [], true);
    expect(state.sceneId).toBe('end');
  });
});
