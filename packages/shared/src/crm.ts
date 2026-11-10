import { z } from 'zod';
import { DateFilters, Segment } from './reports';
import { Language, Level, Role } from './contracts';
export const ContactStage = z.enum(['NEW', 'CONTACTED', 'FOLLOW_UP', 'RESOLVED']);
export const stageNames = {
  NEW: 'Новый',
  CONTACTED: 'Связались',
  FOLLOW_UP: 'Нужен контакт',
  RESOLVED: 'Вопрос решён',
} as const;
export const CrmFilter = DateFilters.extend({
  segment: Segment.optional(),
  search: z.string().trim().max(200).default(''),
  role: Role.optional(),
  stage: ContactStage.optional(),
  due: z.literal('true').optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();
export const ContactUpdate = z
  .object({ stage: ContactStage, followUp: z.string().date().nullable() })
  .strict();
export const AdminAssignment = z.object({ admin: z.boolean() }).strict();
export const NoteInput = z.object({ text: z.string().trim().min(1).max(1500) }).strict();
const Person = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: Role,
  subscribed: z.boolean(),
  language: Language,
  level: Level,
  stage: ContactStage,
  followUp: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export const CrmList = z.object({
  users: z.array(Person),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const CrmMetrics = z.object({
  accounts: z.number(),
  subscribed: z.number(),
  recentLogins: z.number(),
  due: z.number(),
});
export const CrmDetail = z.object({
  user: Person,
  runs: z.number(),
  attempts: z.number(),
  lessons: z.array(z.object({ id: z.string(), title: z.string(), updatedAt: z.string() })),
  history: z.array(
    z.object({ id: z.string(), text: z.string(), author: z.string(), createdAt: z.string() }),
  ),
});
export type CrmDetail = z.infer<typeof CrmDetail>;

export type CrmFilter = z.infer<typeof CrmFilter>;
