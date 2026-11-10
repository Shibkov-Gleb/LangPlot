import { z } from 'zod';
export const Segment = z.enum(['not-started', 'stalled', 'completed', 'registered', 'completed7']);
export const Variant = z.enum(['original', 'first-scene']);
export const DAY = 86400000;
export const moscowDay = (d: Date) =>
  new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 10);
export const DateFilters = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  source: z
    .string()
    .regex(/^[a-z0-9._-]{1,64}$/)
    .optional(),
  variant: Variant.optional(),
});
export const ReportFilter = DateFilters.strict().refine(
  (q) => !q.from || !q.to || q.from <= q.to,
  'Проверьте период',
);
export type ReportFilter = z.infer<typeof ReportFilter>;
export const Metric = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number(),
  base: z.number(),
  pending: z.number(),
  enabled: z.boolean(),
});
export const Overview = z.object({
  trackingSince: z.string(),
  from: z.string(),
  to: z.string(),
  previousFrom: z.string(),
  previousTo: z.string(),
  metrics: z.array(Metric),
  previous: z.array(Metric),
  sources: z.array(z.string()),
});
export const LessonsReport = z.object({
  lessons: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      started: z.number(),
      finished: z.number(),
      continued: z.number().nullable(),
      replays: z.number(),
    }),
  ),
  scenes: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      people: z.number(),
      actions: z.number(),
      mistakes: z.number(),
    }),
  ),
});
export const ExportPreview = z.object({
  id: z.string(),
  columns: z.array(z.string()),
  count: z.number(),
  period: z.string(),
});
