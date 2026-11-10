import { z } from 'zod';
import { Language, Level, type ValidationReport } from './contracts';
import { LessonNote, LessonPhase, Mark, SceneLayout } from './lesson-view';
const id = z
  .string()
  .regex(/^[a-z][a-z0-9._-]{0,79}$/, 'Используйте a–z, цифры, точку, дефис или подчёркивание.');
export const ResourcePath = z
  .string()
  .max(200)
  .refine(
    (value) =>
      /^assets\/[a-zA-Z0-9_/-]+\.(webp|png|jpg|mp3|wav|woff2)$/.test(value) &&
      !value.includes('..') &&
      !value.includes('//'),
    'Недопустимый путь ресурса.',
  );
const condition = z.object({ flag: id, equals: z.boolean() }).strict();
export const ContentPackageV1 = z
  .object({
    schemaVersion: z.literal(1),
    manifest: z
      .object({
        id,
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
        title: z.string().trim().min(1).max(120),
        language: Language,
        level: Level,
        status: z.enum(['draft', 'published', 'technical']),
        description: z.string().max(4000),
      })
      .strict(),
    entrySceneId: id.nullable(),
    characters: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(80),
            knownFacts: z.array(z.string().max(500)).max(100),
          })
          .strict(),
      )
      .max(50),
    learningObjectives: z
      .array(z.object({ id, description: z.string().min(1).max(500) }).strict())
      .max(200),
    resources: z
      .array(
        z
          .object({ id, path: ResourcePath, mediaType: z.enum(['image', 'audio', 'font']) })
          .strict(),
      )
      .max(500),
    scenes: z
      .array(
        z
          .object({
            id,
            text: z.string().min(1).max(8000),
            speakerId: id.optional(),
            resourceId: id.optional(),
            terminal: z.boolean().default(false),
            objectiveIds: z.array(id).default([]),
            choices: z
              .array(
                z
                  .object({
                    id,
                    label: z.string().min(1).max(300),
                    target: id,
                    condition: condition.optional(),
                    setFlags: z.record(id, z.boolean()).default({}),
                    journalEntry: z.string().max(500).optional(),
                  })
                  .strict(),
              )
              .max(20),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type ContentPackageV1 = z.infer<typeof ContentPackageV1>;
const lessonScene = ContentPackageV1.shape.scenes.element.extend({
  phase: LessonPhase,
  layout: SceneLayout,
  marks: z.array(Mark).max(100).default([]),
  portraitId: id.optional(),
  cueId: id.optional(),
  dimLights: z.boolean().optional(),
  artifact: z.enum(['ticket', 'poster']).optional(),
  exercise: z
    .object({
      skill: id,
      correct: id,
      feedback: z.string().min(1).max(550),
      review: z.boolean().default(false),
      number: z.number().int().positive().optional(),
      total: z.number().int().positive().optional(),
    })
    .strict()
    .optional(),
  caption: z.string().max(600).optional(),
});
export const ContentPackageV2 = ContentPackageV1.extend({
  schemaVersion: z.literal(2),
  scenes: z.array(lessonScene).max(1000),
  lesson: z
    .object({
      notes: z.array(LessonNote).max(200),
      gate: id,
      phone: id,
      ticketFlag: id,
      ambienceId: id.optional(),
      contact: id,
      keptOpening: z.string().min(1),
      givenOpening: z.string().min(1),
      reply: z.string().min(1),
    })
    .strict(),
});
export type ContentPackageV2 = z.infer<typeof ContentPackageV2>;
export const ContentPackageV3 = ContentPackageV2.extend({
  schemaVersion: z.literal(3),
  lesson: ContentPackageV2.shape.lesson
    .omit({ ticketFlag: true, keptOpening: true, givenOpening: true })
    .extend({
      decisionFlag: id,
      openings: z.tuple([z.string().min(1), z.string().min(1)]),
      carryFlags: z.array(id),
      contactRole: z.string().min(1),
      phoneContext: z.string().min(1),
      presentation: z.object({
        location: z.string(),
        time: z.string(),
        duration: z.string(),
        finishTitle: z.string(),
      }),
    }),
});
export type ContentPackageV3 = z.infer<typeof ContentPackageV3>;
export const ContentPackageV4 = ContentPackageV3.extend({
  schemaVersion: z.literal(4),
  lesson: ContentPackageV3.shape.lesson.extend({
    initialFlags: z.record(id, z.boolean()).default({}),
    exportFlags: z.array(id).default([]),
    settingVariants: z
      .array(
        z
          .object({
            when: condition,
            resourceId: id,
            location: z.string(),
            arrivalText: z.string(),
          })
          .strict(),
      )
      .default([]),
    reviewTemplates: z
      .array(
        z
          .object({
            skill: id,
            prompt: z.string().min(1).max(1000),
            answer: z.string().min(1).max(300),
            wrong: z.tuple([z.string().max(300), z.string().max(300)]),
            feedback: z.string().max(550),
            caption: z.string().max(600),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    phoneVariants: z
      .array(
        z
          .object({
            when: condition,
            contact: id,
            role: z.string(),
            context: z.string(),
            openings: z.tuple([z.string(), z.string()]),
            reply: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
  }),
});
export type ContentPackageV4 = z.infer<typeof ContentPackageV4>;
export const PlayablePackage = z.discriminatedUnion('schemaVersion', [
  ContentPackageV2,
  ContentPackageV3,
  ContentPackageV4,
]);
export type PlayablePackage = z.infer<typeof PlayablePackage>;
export const ContentPackage = z.discriminatedUnion('schemaVersion', [
  ContentPackageV1,
  ContentPackageV2,
  ContentPackageV3,
  ContentPackageV4,
]);
export type ContentPackage = z.infer<typeof ContentPackage>;

export function validatePackage(
  input: unknown,
  mode: 'draft' | 'publish' = 'draft',
): ValidationReport {
  const parsed = ContentPackage.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      publishable: false,
      errors: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`),
      warnings: [],
    };
  const p = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const [name, items] of Object.entries({
    scenes: p.scenes,
    characters: p.characters,
    objectives: p.learningObjectives,
    resources: p.resources,
  })) {
    const ids = items.map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      errors.push(`${name}: идентификаторы должны быть уникальными.`);
  }
  const scenes = new Map(p.scenes.map((s) => [s.id, s]));
  if (p.scenes.length && (!p.entrySceneId || !scenes.has(p.entrySceneId)))
    errors.push('Начальная сцена не найдена.');
  if (!p.scenes.length && p.entrySceneId)
    errors.push('Пустой пакет не может ссылаться на начальную сцену.');
  for (const scene of p.scenes) {
    if (scene.speakerId && !p.characters.some((x) => x.id === scene.speakerId))
      errors.push(`${scene.id}: персонаж не найден.`);
    if (scene.resourceId && !p.resources.some((x) => x.id === scene.resourceId))
      errors.push(`${scene.id}: ресурс не найден.`);
    if (scene.objectiveIds.some((id) => !p.learningObjectives.some((x) => x.id === id)))
      errors.push(`${scene.id}: учебная цель не найдена.`);
    if (new Set(scene.choices.map((x) => x.id)).size !== scene.choices.length)
      errors.push(`${scene.id}: повторяющиеся выборы.`);
    if (!scene.terminal && !scene.choices.length)
      errors.push(`${scene.id}: нужны переходы или признак terminal.`);
    if (scene.terminal && scene.choices.length)
      errors.push(`${scene.id}: конечная сцена не должна содержать переходы.`);
    for (const choice of scene.choices)
      if (!scenes.has(choice.target))
        errors.push(`${scene.id}/${choice.id}: цель перехода не найдена.`);
  }
  const visited = new Set<string>();
  if (p.schemaVersion === 4) {
    const skills = p.lesson.reviewTemplates.map((t) => t.skill);
    if (new Set(skills).size !== skills.length)
      errors.push('Повторяющиеся навыки в банке повторения.');
    for (const t of p.lesson.reviewTemplates)
      if (!t.prompt.includes('____') || new Set([t.answer, ...t.wrong]).size !== 3)
        errors.push(t.skill + ': проверьте варианты задания повторения.');
    for (const variant of p.lesson.phoneVariants)
      if (!p.characters.some((c) => c.id === variant.contact))
        errors.push('Адресат варианта переписки не найден.');
    for (const variant of p.lesson.settingVariants)
      if (!p.resources.some((r) => r.id === variant.resourceId && r.mediaType === 'image'))
        errors.push('Ресурс варианта места не найден.');
  }
  if (p.schemaVersion !== 1) {
    const notes = new Set(p.lesson.notes.map((note) => note.key));
    const sounds = new Set(p.resources.filter((r) => r.mediaType === 'audio').map((r) => r.id));
    if (p.lesson.ambienceId && !sounds.has(p.lesson.ambienceId))
      errors.push('Фоновый звук урока не найден.');
    if (notes.size !== p.lesson.notes.length) errors.push('Повторяющиеся ключи подсказок.');
    if (
      !p.characters.some((c) => c.id === p.lesson.contact) ||
      p.scenes.find((s) => s.id === p.lesson.gate)?.layout !== 'gate' ||
      p.scenes.find((s) => s.id === p.lesson.phone)?.layout !== 'phone'
    )
      errors.push('Не найдены контрольная сцена, телефон или адресат.');
    for (const s of p.scenes) {
      if (
        s.layout === 'branch' &&
        (p.schemaVersion < 3 ||
          s.choices.length !== 2 ||
          !s.choices[0]?.condition ||
          !s.choices[1]?.condition ||
          s.choices[0].condition.flag !== s.choices[1].condition.flag ||
          s.choices[0].condition.equals === s.choices[1].condition.equals)
      ) {
        errors.push(s.id + ': ветвление должно проверять два значения одного флага.');
      }
      if (s.cueId && !sounds.has(s.cueId)) errors.push(s.id + ': звуковой эффект не найден.');
      if ((s.layout === 'end') !== s.terminal)
        errors.push(s.id + ': проверьте признак завершения.');
      if (
        !s.resourceId ||
        !p.resources.some((r) => r.id === s.resourceId && r.mediaType === 'image') ||
        (s.portraitId && !p.resources.some((r) => r.id === s.portraitId && r.mediaType === 'image'))
      )
        errors.push(s.id + ': иллюстрация не найдена.');
      if (s.marks.some((m) => !notes.has(m.note) || !s.text.includes(m.text)))
        errors.push(s.id + ': подсказка не привязана к тексту.');
      const task = s.exercise;
      if ((s.layout === 'task') !== Boolean(task)) errors.push(s.id + ': ожидается задание.');
      if (
        task &&
        (!s.objectiveIds.includes(task.skill) ||
          !s.choices.some((c) => c.id === task.correct && c.target !== s.id) ||
          s.choices.some(
            (c) =>
              c.id !== task.correct &&
              (c.target !== s.id || Object.keys(c.setFlags).length || c.journalEntry),
          ))
      )
        errors.push(s.id + ': неверные переходы упражнения.');
    }
  }
  const queue = p.entrySceneId ? [p.entrySceneId] : [];
  while (queue.length) {
    const next = queue.pop()!;
    if (visited.has(next)) continue;
    visited.add(next);
    if (p.schemaVersion !== 1 && p.schemaVersion !== 2 && next === p.lesson.gate) {
      queue.push(p.lesson.phone, ...p.scenes.filter((s) => s.exercise?.review).map((s) => s.id));
    }
    for (const c of scenes.get(next)?.choices ?? []) queue.push(c.target);
  }
  for (const scene of p.scenes)
    if (!visited.has(scene.id)) errors.push(`${scene.id}: сцена недостижима.`);
  const contentComplete =
    p.scenes.length > 0 &&
    p.characters.length > 0 &&
    p.learningObjectives.length > 0 &&
    p.scenes.some((s) => s.terminal);
  if (!contentComplete)
    warnings.push('Черновик: для публикации нужны сцены, персонажи, учебные цели и завершение.');
  if (p.resources.length)
    warnings.push('Ресурсы должны быть загружены и проверены хранилищем перед публикацией.');
  const publishable =
    !errors.length && contentComplete && p.manifest.status !== 'technical' && !p.resources.length;
  if (mode === 'publish' && !publishable)
    errors.push('Публикация недоступна: пакет не завершён или ресурсы не подтверждены.');
  return { valid: errors.length === 0, publishable, errors, warnings };
}

export function createDraft(
  brief: string,
  language: 'en' | 'de',
  level: z.infer<typeof Level>,
  packageId: string,
): ContentPackage {
  return {
    schemaVersion: 1,
    manifest: {
      id: packageId,
      version: '0.1.0',
      title: 'Новый учебный мир',
      language,
      level,
      status: 'draft',
      description: brief,
    },
    entrySceneId: null,
    characters: [],
    scenes: [],
    learningObjectives: [],
    resources: [],
  };
}
