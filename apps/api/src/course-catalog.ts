import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  PlayablePackage,
  GameState,
  Language,
  Level,
  languageNames,
  validatePackage,
  decisionFlag,
  StudyGuide,
  type StudyTopics,
  type CourseLesson,
  type CourseResponse,
} from '@langplot/shared';
import { db } from './db.js';
import { ApiError } from './errors.js';

const outline = z.array(
  z.object({
    language: Language,
    level: Level,
    title: z.string().min(1),
    sections: z.array(
      z.object({
        title: z.string().min(1),
        lessons: z.array(
          z.union([
            z
              .object({
                number: z.number().int().positive(),
                slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
                routes: z
                  .array(
                    z.object({
                      route: z.enum(['D', 'F']),
                      slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
                    }),
                  )
                  .optional(),
              })
              .strict(),
            z
              .object({
                number: z.number().int().positive(),
                title: z.string().min(1),
                variants: z.array(z.string()).optional(),
              })
              .strict(),
          ]),
        ),
      }),
    ),
  }),
);
function readContent(path: string): unknown {
  return JSON.parse(readFileSync(new URL('../../../content/' + path, import.meta.url), 'utf8'));
}
export const courses = outline.parse(readContent('courses/catalog.json'));
const studyGuide = StudyGuide.parse(readContent('courses/en-a2-study-guide.json'));
const grammarGuides = new Map(studyGuide.grammar.map((g) => [g.key, g]));
export function lessonStudy(slug: string) {
  const entry = studyGuide.lessons[slug];
  if (!entry) return {};
  const guides = entry.grammarKeys.map((key) => grammarGuides.get(key)!);
  const topics: StudyTopics = {
    grammar: guides.map((g) => g.title),
    vocabulary: entry.vocabulary,
  };
  return { topics, grammarGuides: guides };
}
type Course = (typeof courses)[number];
export type ReadyLesson = {
  slug: string;
  number: number;
  course: Course;
  content: PlayablePackage;
  route?: 'D' | 'F';
};
export const readyLessons = new Map<string, ReadyLesson>();
const packageIds = new Set<string>();
const courseKeys = new Set<string>();
for (const course of courses) {
  const key = course.language + '/' + course.level;
  if (courseKeys.has(key)) throw new Error('Повтор курса ' + key);
  courseKeys.add(key);
  let previousNumber = 0;
  for (const section of course.sections) {
    for (const entry of section.lessons) {
      if (entry.number <= previousNumber) throw new Error('Неверный порядок уроков ' + key);
      previousNumber = entry.number;
      if (!('slug' in entry)) continue;
      for (const variant of entry.routes ?? [{ slug: entry.slug, route: undefined }]) {
        const source = readContent('lessons/' + variant.slug + '.json');
        const report = validatePackage(source);
        if (!report.valid) throw new Error(entry.slug + ': ' + report.errors.join('; '));
        const content = PlayablePackage.parse(source);
        if (
          content.manifest.language !== course.language ||
          content.manifest.level !== course.level ||
          readyLessons.has(variant.slug) ||
          packageIds.has(content.manifest.id)
        )
          throw new Error('Урок не соответствует каталогу: ' + entry.slug);
        readyLessons.set(variant.slug, {
          slug: variant.slug,
          number: entry.number,
          course,
          content,
          route: variant.route,
        });
        packageIds.add(content.manifest.id);
      }
    }
  }
}

export function getLesson(slug: string) {
  const lesson = readyLessons.get(slug);
  if (!lesson) throw new ApiError(404, 'LESSON_NOT_FOUND', 'Урок не найден.');
  return lesson;
}
export function getCourse(language: string, level: string): Course {
  const lang = Language.safeParse(language),
    lv = Level.safeParse(level.toUpperCase());
  if (!lang.success || !lv.success) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Курс не найден.');
  return (
    courses.find((c) => c.language === lang.data && c.level === lv.data) ?? {
      language: lang.data,
      level: lv.data,
      title: languageNames[lang.data] + ' · ' + lv.data,
      sections: [],
    }
  );
}

type SavedRun = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  finished: boolean;
  content: PlayablePackage;
  flags: Record<string, boolean>;
};
type LessonHistory = { latest?: SavedRun; completed?: SavedRun };
export async function readCourseHistory(lessons: ReadyLesson[], userId?: string) {
  const history = new Map<string, LessonHistory>();
  if (!userId || !lessons.length) return history;
  const versions = await db.contentVersion.findMany({
    where: {
      packageId: { in: lessons.map((l) => l.content.manifest.id) },
      plays: { some: { userId } },
    },
    select: {
      packageId: true,
      data: true,
      plays: {
        where: { userId },
        select: { id: true, state: true, createdAt: true, updatedAt: true },
        orderBy: { runNumber: 'desc' },
      },
    },
  });
  for (const version of versions) {
    const content = PlayablePackage.parse(version.data);
    const terminalIds = new Set(content.scenes.filter((s) => s.terminal).map((s) => s.id));
    const entry = history.get(version.packageId) ?? {};
    for (const play of version.plays) {
      const run: SavedRun = {
        ...play,
        finished: terminalIds.has(GameState.parse(play.state).sceneId),
        content,
        flags: GameState.parse(play.state).flags,
      };
      if (!entry.latest || run.createdAt > entry.latest.createdAt) entry.latest = run;
      if (run.finished && (!entry.completed || run.updatedAt > entry.completed.updatedAt))
        entry.completed = run;
    }
    history.set(version.packageId, entry);
  }
  return history;
}
export async function inheritedFlags(lesson: ReadyLesson, userId: string) {
  if (lesson.content.schemaVersion === 2) return {};
  const preceding = [...readyLessons.values()]
    .filter((l) => l.course === lesson.course && l.number < lesson.number)
    .sort((a, b) => a.number - b.number);
  const history = await readCourseHistory(preceding, userId);
  const routeSources = preceding
    .filter((l) => l.route || l.number === 30)
    .map((l) => ({ lesson: l, run: history.get(l.content.manifest.id)?.completed }))
    .filter((x) => x.run)
    .sort((a, b) => b.run!.updatedAt.getTime() - a.run!.updatedAt.getTime());
  const selectedRoute = lesson.route ?? (routeSources[0]?.run?.flags['story.route-f'] ? 'F' : 'D');
  const flags: Record<string, boolean> = {};
  for (const prior of preceding) {
    if (prior.route && prior.route !== selectedRoute) continue;
    const completed = history.get(prior.content.manifest.id)?.completed;
    if (!completed) continue;
    const exports =
      completed.content.schemaVersion === 4
        ? [decisionFlag(completed.content), ...completed.content.lesson.exportFlags]
        : [decisionFlag(completed.content)];
    for (const key of exports) {
      if (lesson.content.lesson.carryFlags.includes(key) && completed.flags[key] !== undefined) {
        flags[key] = completed.flags[key]!;
        flags['known.' + key] = true;
      }
    }
  }
  return {
    ...flags,
    ...(lesson.content.schemaVersion === 4 ? lesson.content.lesson.initialFlags : {}),
  };
}
export function courseDetails(course: Course, history: Map<string, LessonHistory>): CourseResponse {
  return {
    language: course.language,
    level: course.level,
    title: course.title,
    lessons: course.sections.flatMap((section) =>
      section.lessons.map((entry): CourseLesson => {
        if (!('slug' in entry))
          return {
            ...entry,
            section: section.title,
            slug: null,
            status: 'planned',
            theoryOpen: false,
            replayFrom: null,
          };
        const lesson = getLesson(entry.slug),
          progress = history.get(lesson.content.manifest.id);
        const routeLessons = entry.routes?.map((v) => {
          const l = getLesson(v.slug),
            p = history.get(l.content.manifest.id);
          return {
            number: entry.number,
            title: l.content.manifest.title,
            slug: v.slug,
            topics: lessonStudy(v.slug).topics,
            route: v.route,
            status: p?.latest
              ? p.latest.finished
                ? ('finished' as const)
                : ('active' as const)
              : ('ready' as const),
            theoryOpen: !!p?.completed,
            replayFrom: p?.latest?.finished ? p.latest.id : null,
          };
        });
        return {
          number: entry.number,
          title: lesson.content.manifest.title,
          slug: entry.slug,
          topics: lessonStudy(entry.slug).topics,
          section: section.title,
          status: progress?.latest ? (progress.latest.finished ? 'finished' : 'active') : 'ready',
          theoryOpen: !!progress?.completed,
          replayFrom: progress?.latest?.finished ? progress.latest.id : null,
          ...(routeLessons
            ? {
                routeLessons,
                theoryOpen: routeLessons.some((l) => l.theoryOpen),
                status: routeLessons.some((l) => l.status === 'active')
                  ? 'active'
                  : routeLessons.some((l) => l.status === 'finished')
                    ? 'finished'
                    : 'ready',
              }
            : {}),
        };
      }),
    ),
  };
}
export function materialInfo(lesson: ReadyLesson, content: PlayablePackage) {
  return {
    language: lesson.course.language,
    level: lesson.course.level,
    title: lesson.course.title,
    slug: lesson.slug,
    number: lesson.number,
    lessonTitle: content.manifest.title,
  };
}
