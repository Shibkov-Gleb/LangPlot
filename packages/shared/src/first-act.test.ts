import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PlayablePackage, validatePackage } from './content';
import { initialState } from './engine';
import { decisionFlag, lessonTransition, lessonView, phoneOpening } from './lesson-engine';
const catalog = JSON.parse(
  readFileSync(new URL('../../../content/courses/catalog.json', import.meta.url), 'utf8'),
);
const lessons: PlayablePackage[] = catalog[0].sections[0].lessons.map((entry: { slug: string }) =>
  PlayablePackage.parse(
    JSON.parse(
      readFileSync(
        new URL('../../../content/lessons/' + entry.slug + '.json', import.meta.url),
        'utf8',
      ),
    ),
  ),
);
describe('First fifteen lessons', () => {
  it('validates the packages and every local resource', () => {
    for (const lesson of lessons) {
      expect(validatePackage(lesson).errors, lesson.manifest.title).toEqual([]);
      for (const resource of lesson.resources)
        expect(() =>
          readFileSync(new URL('../../../apps/web/public/' + resource.path, import.meta.url)),
        ).not.toThrow();
    }
  });
  for (const lesson of lessons.filter((l) => l.schemaVersion === 3)) {
    for (const branch of ['choose-a', 'choose-b']) {
      it(lesson.manifest.title + ' / ' + branch, () => {
        let state = initialState(lesson),
          tasks = 0,
          decisions = 0;
        for (let i = 0; i < 90; i++) {
          const view = lessonView(lesson, state),
            scene = lesson.scenes.find((s) => s.id === state.sceneId)!;
          if (scene.terminal) break;
          const choice = scene.exercise
            ? scene.exercise.correct
            : view.layout === 'choice'
              ? branch
              : view.choices[0]!.id;
          if (scene.exercise) {
            tasks++;
            const bad = scene.choices.find((c) => c.id !== choice)!;
            const failed = lessonTransition(lesson, state, bad.id, [], true);
            expect(failed.sceneId).toBe(state.sceneId);
            expect(failed.flags).toEqual(state.flags);
            expect(failed.feedback).toBe(scene.exercise.feedback);
          }
          if (view.layout === 'choice') decisions++;
          if (view.layout === 'phone') {
            expect(phoneOpening(lesson, state)).toBe(
              lesson.lesson.openings[branch === 'choose-a' ? 0 : 1],
            );
            expect(() => lessonTransition(lesson, state, 'finish', [], false)).toThrow();
          }
          state = lessonTransition(lesson, state, choice, [], true);
        }
        expect(state.sceneId).toBe('end');
        expect(decisions).toBe(1);
        expect(tasks).toBeGreaterThanOrEqual(7);
        expect(state.flags[decisionFlag(lesson)]).toBe(branch === 'choose-a');
        expect(state.journal).toHaveLength(1);
      });
    }
  }
  it('restores both ticket consequences and allows exactly two due journal reconstructions', () => {
    const lesson = lessons[4]!;
    for (const kept of [true, false]) {
      let state: ReturnType<typeof initialState> = {
        ...initialState(lesson),
        flags: { kept, 'known.kept': true },
      };
      for (let i = 0; i < 7; i++) state = lessonTransition(lesson, state, 'next', [], true);
      expect(state.sceneId).toBe(kept ? 'ticket-kept-1' : 'ticket-given-1');
    }
    let state = { ...initialState(lesson), sceneId: 'word-7' };
    const skillIds = lesson.scenes.filter((s) => s.exercise?.review).map((s) => s.exercise!.skill);
    state = lessonTransition(
      lesson,
      state,
      lesson.scenes.find((s) => s.id === state.sceneId)!.exercise!.correct,
      skillIds.slice(0, 3),
      true,
    );
    let reviews = 0;
    while (state.sceneId !== 'phone') {
      const scene = lesson.scenes.find((s) => s.id === state.sceneId)!;
      expect(scene.exercise?.review).toBe(true);
      state = lessonTransition(lesson, state, scene.exercise!.correct, [], true);
      reviews++;
    }
    expect(reviews).toBe(2);
  });
});
