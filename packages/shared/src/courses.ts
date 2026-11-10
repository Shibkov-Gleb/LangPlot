import { z } from 'zod';
import { Language, Level } from './contracts';
import { LessonNote } from './lesson-view';
import type { PlayablePackage } from './content';
import { GrammarGuide, StudyTopics } from './study-guide';

const courseIdentity = z.object({ language: Language, level: Level, title: z.string() });
const courseLesson = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  slug: z.string().nullable(),
  section: z.string().optional(),
  variants: z.array(z.string()).optional(),
  status: z.enum(['planned', 'ready', 'active', 'finished']),
  theoryOpen: z.boolean(),
  replayFrom: z.string().nullable(),
  topics: StudyTopics.optional(),
});
export const CourseLesson = courseLesson.extend({
  routeLessons: z.array(courseLesson.extend({ route: z.enum(['D', 'F']) })).optional(),
});
export type CourseLesson = z.infer<typeof CourseLesson>;
export const CourseResponse = courseIdentity.extend({ lessons: z.array(CourseLesson) });
export type CourseResponse = z.infer<typeof CourseResponse>;
const materialLesson = courseIdentity.extend({
  slug: z.string(),
  number: z.number().int().positive(),
  lessonTitle: z.string(),
});
export const MaterialsResponse = z.object({ lessons: z.array(materialLesson) });
export type MaterialsResponse = z.infer<typeof MaterialsResponse>;
export const TheoryResponse = materialLesson.extend({
  notes: z.array(LessonNote),
  topics: StudyTopics.optional(),
  grammarGuides: z.array(GrammarGuide).default([]),
});
export type TheoryResponse = z.infer<typeof TheoryResponse>;

export function theoryNotes(content: PlayablePackage): LessonNote[] {
  const examples = new Map<string, string>();
  for (const scene of content.scenes) {
    if (scene.text.includes('____')) continue;
    for (const mark of scene.marks) {
      if (examples.has(mark.note)) continue;
      const sentence = scene.text
        .match(/[^.!?]+(?:[.!?]+|$)/g)
        ?.find((part) => part.includes(mark.text));
      if (sentence && sentence.trim().length <= 300) examples.set(mark.note, sentence.trim());
    }
  }
  return content.lesson.notes.map((note) => ({
    ...note,
    example: note.example ?? examples.get(note.key),
  }));
}
