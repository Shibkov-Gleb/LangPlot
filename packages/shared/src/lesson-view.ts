import { z } from 'zod';

export const LessonPhase = z.enum([
  'arrival',
  'dialogue',
  'grammar',
  'ticket',
  'reading',
  'practice',
  'phone',
  'end',
]);
export const SceneLayout = z.enum([
  'arrival',
  'line',
  'task',
  'choice',
  'reading',
  'phone',
  'end',
  'gate',
  'branch',
]);
export const LessonNote = z
  .object({
    key: z.string().min(1).max(80),
    kind: z.enum(['word', 'grammar']),
    title: z.string().min(1).max(120),
    meaning: z.string().min(1).max(600),
    example: z.string().max(300).optional(),
  })
  .strict();
export const Mark = z
  .object({ text: z.string().min(1).max(180), note: z.string().max(80) })
  .strict();
export const LessonView = z.object({
  title: z.string(),
  phase: LessonPhase,
  layout: SceneLayout,
  text: z.string(),
  speaker: z.string().optional(),
  backdrop: z.string(),
  ambience: z.string().optional(),
  cue: z.string().optional(),
  speech: z.string().regex(/^\/assets\/voices\/en-a2\/[a-f0-9]{24}\.mp3$/).optional(),
  dimLights: z.boolean().optional(),
  portrait: z.string().optional(),
  notes: z.array(LessonNote),
  marks: z.array(Mark),
  choices: z.array(z.object({ id: z.string(), label: z.string() })),
  step: z.number(),
  steps: z.number(),
  taskNumber: z.number().optional(),
  taskTotal: z.number().optional(),
  artifact: z.enum(['ticket', 'poster']).optional(),
  phoneAvailable: z.boolean(),
  postReview: z.boolean().optional(),
  caption: z.string().optional(),
  contact: z.object({ name: z.string(), role: z.string(), context: z.string() }).optional(),
  presentation: z
    .object({
      location: z.string(),
      time: z.string(),
      duration: z.string(),
      finishTitle: z.string(),
    })
    .optional(),
});
export type LessonView = z.infer<typeof LessonView>;
export type LessonNote = z.infer<typeof LessonNote>;
export const RunList = z.object({
  course: z
    .object({
      language: z.enum(['en', 'de']),
      level: z.string(),
      title: z.string(),
      number: z.number().int().positive(),
      nextLesson: z.object({ slug: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  runs: z.array(
    z.object({
      id: z.string(),
      runNumber: z.number(),
      finished: z.boolean(),
      ticket: z.enum(['lev', 'owen']).nullable(),
      decision: z.string().nullable().optional(),
    }),
  ),
});
