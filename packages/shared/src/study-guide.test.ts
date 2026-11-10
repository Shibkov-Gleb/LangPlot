import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StudyGuide } from './study-guide';
import { LessonNote } from './lesson-view';

const root = new URL('../../../content/', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const source = read('courses/en-a2-study-guide.json');
const guide = StudyGuide.parse(source);
const catalog = read('courses/catalog.json')[0];

describe('English A2 reference materials', () => {
  it('covers the grammar actually taught in every playable lesson on both routes', () => {
    const slugs: string[] = catalog.sections.flatMap(
      (s: { lessons: { slug: string; routes?: { slug: string }[] }[] }) =>
        s.lessons.flatMap((row) => (row.routes ?? [row]).map((v) => v.slug)),
    );
    expect(Object.keys(guide.lessons).sort()).toEqual([...slugs].sort());
    const taught = new Set<string>();
    for (const slug of slugs) {
      const notes = LessonNote.array().parse(read('lessons/' + slug + '.json').lesson.notes);
      const keys = notes.filter((n) => n.kind === 'grammar').map((n) => n.key);
      expect(guide.lessons[slug]!.grammarKeys, slug).toEqual(keys);
      keys.forEach((key) => taught.add(key));
    }
    expect(guide.grammar.map((g) => g.key).sort()).toEqual([...taught].sort());
  });

  it('provides explanations, translated examples, comparison tables and correction for every topic', () => {
    for (const article of guide.grammar) {
      expect(
        article.sections.some((s) => s.table),
        article.key,
      ).toBe(true);
      expect(
        article.sections.flatMap((s) => s.examples).length,
        article.key,
      ).toBeGreaterThanOrEqual(3);
      expect(article.mistakes.length, article.key).toBeGreaterThanOrEqual(2);
      expect(article.recap.length, article.key).toBeGreaterThanOrEqual(3);
      for (const section of article.sections)
        for (const example of section.examples) {
          expect(example.en, article.key).toMatch(/[a-z]/i);
          expect(example.ru, article.key).toMatch(/[а-яё]/i);
        }
    }
  });

  it('rejects broken cross-references and tables before the course is served', () => {
    const badKey = structuredClone(source);
    badKey.lessons['last-row'].grammarKeys = ['unknown'];
    expect(StudyGuide.safeParse(badKey).success).toBe(false);
    const badTable = structuredClone(source);
    badTable.grammar[0].sections.find((s: { table?: unknown }) => s.table).table.rows[0].pop();
    expect(StudyGuide.safeParse(badTable).success).toBe(false);
  });
});
