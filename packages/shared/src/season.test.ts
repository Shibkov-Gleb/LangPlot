import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { PlayablePackage, validatePackage } from './content';
import { initialState } from './engine';
import {
  lessonScene,
  lessonTransition,
  lessonView,
  decisionFlag,
  phoneOpening,
  reviewSkills,
  lessonContact,
} from './lesson-engine';
const root = new URL('../../../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('content/courses/catalog.json', root), 'utf8'))[0];
const packages = new Map<string, PlayablePackage>();
for (const section of catalog.sections)
  for (const row of section.lessons)
    for (const v of row.routes ?? [row]) {
      packages.set(
        v.slug,
        PlayablePackage.parse(
          JSON.parse(readFileSync(new URL('content/lessons/' + v.slug + '.json', root), 'utf8')),
        ),
      );
    }
const get = (n: number, route = 'D') =>
  n < 16
    ? [...packages.values()].find((c) =>
        n === 1
          ? c.manifest.id.endsWith('last-row')
          : c.manifest.description.includes('Урок ' + String(n).padStart(2, '0') + '.'),
      )!
    : packages.get(
        'episode-' + String(n).padStart(2, '0') + (n >= 31 && n <= 45 ? route.toLowerCase() : ''),
      )!;
describe('Complete English A2 season', () => {
  it('contains 90 chapters and both complete fifteen-chapter routes', () => {
    expect(catalog.sections.flatMap((s: { lessons: unknown[] }) => s.lessons)).toHaveLength(90);
    expect(packages.size).toBe(105);
    const resources = new Set<string>();
    for (const c of packages.values()) {
      expect(validatePackage(c).errors, c.manifest.title).toEqual([]);
      c.resources.forEach((r) => resources.add(r.path));
    }
    for (const resource of resources)
      expect(existsSync(new URL('apps/web/public/' + resource, root)), resource).toBe(true);
  }, 15000);
  for (const route of ['D', 'F'])
    for (const witness of [false, true])
      for (const copy of [false, true])
        for (const help of [false, true])
          for (const exit of [false, true]) {
            it([route, witness, copy, help, exit].join('/'), () => {
              const flags: Record<string, boolean> = {};
              const words = new Set<string>(),
                grammar = new Set<string>(),
                active = new Set<string>();
              for (let n = 1; n <= 90; n++) {
                const c = get(n, route);
                let state = {
                  ...initialState(c),
                  flags: { ...flags, ...(c.schemaVersion === 4 ? c.lesson.initialFlags : {}) },
                };
                c.lesson.notes.forEach((note, index) => {
                  if (/^v\d\d\.\d\d$/.test(note.key)) words.add(note.key);
                  if (n === 1 && index < 14) words.add('v15.' + String(index + 1).padStart(2, '0'));
                  if (note.kind === 'grammar') grammar.add(note.key);
                });
                if (route === 'F' && n >= 31 && n <= 40)
                  expect(lessonView(c, state).backdrop.endsWith('/porch.webp')).toBe(!witness);
                let finish = false;
                for (let step = 0; step < 100; step++) {
                  const scene = lessonScene(c, state.sceneId)!;
                  if (n > 73 && !flags['owen.alive']) expect(scene.speakerId).not.toBe('owen');
                  if (scene.terminal) {
                    finish = true;
                    break;
                  }
                  if (n === 85 && scene.id === 'ending-choice') {
                    const choices = lessonView(c, state).choices.map((x) => x.id);
                    expect(choices.includes('ending-h')).toBe(witness);
                    expect(choices.includes('ending-f')).toBe(copy);
                  }
                  let choice = scene.exercise?.correct ?? scene.choices[0]!.id;
                  if (scene.layout === 'choice') {
                    if (scene.id === 'ending-choice')
                      choice = witness ? 'ending-h' : copy ? 'ending-f' : 'ending-p';
                    else if (n === 1) choice = 'keep';
                    else
                      choice = (
                        [21, 24, 30, 55, 65].includes(n)
                          ? { 21: witness, 24: copy, 30: route === 'D', 55: help, 65: exit }[n]
                          : true
                      )
                        ? 'choose-a'
                        : 'choose-b';
                  }
                  if (
                    scene.exercise &&
                    !scene.exercise.review &&
                    scene.exercise.skill.startsWith('v')
                  )
                    active.add(scene.exercise.skill);
                  state = lessonTransition(c, state, choice, [], true);
                  expect(state.flags['e21.a']).toBe(n > 21 ? witness : state.flags['e21.a']);
                }
                expect(finish, c.manifest.title).toBe(true);
                if (n === 73) expect(state.flags['owen.alive']).toBe(help || exit);
                if (n === 90) {
                  const contact = lessonContact(c, state)!;
                  expect(contact.name).toBe(
                    witness ? 'Мэй Роу' : copy ? 'Нэлл Дейл' : 'Илья Сомов',
                  );
                  expect(phoneOpening(c, state)).toBeTruthy();
                }
                const own = decisionFlag(c);
                for (const key of [own, ...(c.schemaVersion === 4 ? c.lesson.exportFlags : [])])
                  if (state.flags[key] !== undefined) {
                    flags[key] = state.flags[key]!;
                    flags['known.' + key] = true;
                  }
              }
              expect(words.size).toBe(1116);
              expect(grammar.size).toBe(32);
              expect(active.size).toBe(540);
            });
          }
  it('uses a pinned review template and finishes a post-season reconstruction without a phone', () => {
    const c = get(90);
    expect(c.schemaVersion).toBe(4);
    let state: ReturnType<typeof initialState> = {
      ...initialState(c),
      sceneId: 'review.g04',
      flags: { 'review.only': true },
      reviewQueue: [],
    };
    const scene = lessonScene(c, state.sceneId)!;
    expect(scene.exercise?.review).toBe(true);
    state = lessonTransition(c, state, scene.exercise!.correct, [], false);
    expect(state.sceneId).toBe('end');
    expect(lessonView(c, state).postReview).toBe(true);
    expect(phoneOpening(c, state)).toBeUndefined();
  });
  it('blanks the complete verb without cutting the noun performance', () => {
    const expected =
      'Our audience came for one performance on a small stage. Children ____ after supper.';
    for (const route of ['D', 'F']) {
      const scene = get(34, route).scenes.find((s) => s.exercise?.skill === 'v25.04')!;
      expect(scene.text).toBe(expected);
      expect(scene.marks.some((m) => m.text === 'perform')).toBe(false);
      expect(scene.marks.some((m) => m.text === 'performance')).toBe(true);
    }
    const last = get(90);
    expect(
      last.schemaVersion === 4 &&
        last.lesson.reviewTemplates.find((t) => t.skill === 'v25.04')?.prompt,
    ).toBe(expected);
  });
  it('keeps signature intact when practicing the verb sign', () => {
    const expected = 'A signature shows who agreed to ____.';
    expect(
      get(8).scenes.find((s) => s.exercise?.skill === 'v39.13' && !s.exercise.review)?.text,
    ).toBe(expected);
    const last = get(90);
    expect(
      last.schemaVersion === 4 &&
        last.lesson.reviewTemplates.find((t) => t.skill === 'v39.13')?.prompt,
    ).toBe(expected);
  });
});
