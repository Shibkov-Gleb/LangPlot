import { z } from 'zod';

const text = z.string().trim().min(1);
export const StudyTopics = z.object({
  grammar: z.array(text).min(1),
  vocabulary: z.array(text).min(1),
});
export type StudyTopics = z.infer<typeof StudyTopics>;
export const GrammarGuide = z.object({
  key: text,
  title: text,
  overview: text,
  sections: z
    .array(
      z.object({
        title: text,
        paragraphs: z.array(text),
        table: z
          .object({
            headers: z.array(text).min(2),
            rows: z.array(z.array(text)).min(1),
          })
          .refine(
            (t) => t.rows.every((row) => row.length === t.headers.length),
            'Неверное число ячеек таблицы.',
          )
          .optional(),
        examples: z
          .array(z.object({ en: text, ru: text, explanation: text.optional() }))
          .default([]),
      }),
    )
    .min(1),
  mistakes: z.array(z.object({ wrong: text, right: text, explanation: text })),
  recap: z.array(text),
});
export type GrammarGuide = z.infer<typeof GrammarGuide>;
export const StudyGuide = z
  .object({
    version: z.literal(1),
    grammar: z.array(GrammarGuide),
    lessons: z.record(
      text,
      z.object({
        grammarKeys: z.array(text).min(1),
        vocabulary: z.array(text).min(1),
      }),
    ),
  })
  .superRefine((guide, ctx) => {
    const keys = new Set(guide.grammar.map((g) => g.key));
    if (keys.size !== guide.grammar.length)
      ctx.addIssue({ code: 'custom', message: 'Повтор грамматической темы.' });
    for (const [slug, lesson] of Object.entries(guide.lessons))
      if (lesson.grammarKeys.some((key) => !keys.has(key)))
        ctx.addIssue({ code: 'custom', message: slug + ': неизвестная грамматическая тема.' });
  });
