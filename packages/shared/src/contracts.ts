import { z } from 'zod';
import { LessonView } from './lesson-view';
export const Language = z.enum(['en', 'de']);
export const Level = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export const levels = Level.options;
export const languageNames = { en: 'Английский', de: 'Немецкий' } as const;
export const levelDescriptions = {
  A1: 'Первые слова',
  A2: 'Простые разговоры',
  B1: 'Больше самостоятельности',
  B2: 'Уверенное общение',
  C1: 'Тонкости языка',
  C2: 'Свобода выражения',
} as const;
export const ProfileSettings = z
  .object({
    name: z.string().trim().min(1).max(60),
    nativeLanguage: z.enum(['ru', 'en', 'de']),
    sound: z.boolean(),
    subtitles: z.boolean(),
    reducedMotion: z.boolean(),
  })
  .strict();
export const Selection = z.object({ language: Language, level: Level }).strict();
export const Role = z.enum(['USER', 'SUBSCRIBER', 'ADMIN', 'SUPERADMIN']);
export type Role = z.infer<typeof Role>;
export const roleNames: Record<Role, string> = {
  USER: 'Без подписки',
  SUBSCRIBER: 'С подпиской',
  ADMIN: 'Администратор',
  SUPERADMIN: 'Главный администратор',
};
export const isStaff = (role: Role) => role === 'ADMIN' || role === 'SUPERADMIN';
export const Email = z.string().trim().toLowerCase().email().max(254);
export const LoginInput = z.object({ email: Email, password: z.string().min(1).max(128) }).strict();
export const RegisterInput = LoginInput.extend({
  name: ProfileSettings.shape.name,
  password: z.string().min(10).max(128),
}).strict();
export const OwnerInput = RegisterInput.extend({
  token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const Profile = ProfileSettings.merge(Selection).extend({
  id: z.string(),
  email: Email,
  role: Role,
  subscribed: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;
export const SessionResponse = z.object({ user: Profile.nullable(), localMode: z.boolean() });
export const GuestSessionResponse = z.object({ guest: z.boolean() });
export const ProfileResponse = z.object({ user: Profile });
export const OkResponse = z.object({ ok: z.literal(true) });
export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.string()).optional(),
  }),
});
export const CatalogResponse = z.object({
  worlds: z.array(
    z.object({
      language: Language,
      name: z.string(),
      levels: z.array(
        z.object({
          level: Level,
          status: z.enum(['preparing', 'available']),
          course: z
            .object({ title: z.string(), lessonCount: z.number().int().nonnegative() })
            .optional(),
          lesson: z
            .object({
              slug: z.string(),
              title: z.string(),
              started: z.boolean(),
              completed: z.boolean(),
            })
            .optional(),
        }),
      ),
    }),
  ),
});
export const GameState = z.object({
  sceneId: z.string(),
  flags: z.record(z.boolean()),
  visited: z.array(z.string()),
  journal: z.array(z.string()),
  choices: z.array(z.string()),
  feedback: z.string().optional(),
  reviewQueue: z.array(z.string()).optional(),
});
export type GameState = z.infer<typeof GameState>;
export const Play = z.object({
  id: z.string(),
  language: Language,
  revision: z.number().int().nonnegative(),
  contentVersion: z.string(),
  state: GameState,
  runNumber: z.number().int().positive().default(1),
  view: LessonView.optional(),
});
export type Play = z.infer<typeof Play>;
export const PlayResponse = z.object({ play: Play });
export const ActionInput = z
  .object({
    requestId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    choiceId: z.string().min(1).max(100),
  })
  .strict();
export const ChatInput = z
  .object({ requestId: z.string().uuid(), text: z.string().trim().min(1).max(2000) })
  .strict();
export const Observation = z.object({
  skillId: z.string().max(80),
  outcome: z.enum(['success', 'practice']),
  note: z.string().max(500),
});
export const ChatResult = z
  .object({
    reply: z.string().min(1).max(4000),
    messages: z.array(z.string().trim().min(1).max(500)).min(1).max(4).optional(),
    intent: z.enum(['greeting', 'message', 'question']),
    observations: z.array(Observation).max(10),
    suggestedFlags: z.record(z.boolean()),
  })
  .strict();
export type ChatResult = z.infer<typeof ChatResult>;
export const Exchange = z.object({
  id: z.string(),
  requestId: z.string().uuid(),
  text: z.string(),
  reply: z.string().nullable(),
  replies: z.array(z.string()).max(4).default([]),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
});
export type Exchange = z.infer<typeof Exchange>;
export const ChatResponse = z.object({ exchange: Exchange });
export const MessagesResponse = z.object({
  messages: z.array(Exchange),
  opening: z.string().optional(),
});
export const ProgressResponse = z.object({
  technicalAttempts: z.number(),
  skills: z.array(
    z.object({
      skillId: z.string(),
      description: z.string().optional(),
      successes: z.number(),
      attempts: z.number(),
    }),
  ),
  publishedCourses: z.number(),
});
export const StudioInput = z
  .object({ brief: z.string().trim().min(10).max(4000), language: Language, level: Level })
  .strict();
export const ValidationReport = z.object({
  valid: z.boolean(),
  publishable: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ValidationReport = z.infer<typeof ValidationReport>;
export const Job = z.object({
  id: z.string(),
  brief: z.string(),
  language: Language,
  level: Level,
  status: z.enum(['queued', 'running', 'completed', 'failed', 'interrupted']),
  stage: z.string(),
  output: z.unknown().nullable(),
  report: ValidationReport.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type Job = z.infer<typeof Job>;
export const JobsResponse = z.object({ jobs: z.array(Job) });
export const JobResponse = z.object({ job: Job });
export const ImportResponse = z.object({ id: z.string(), report: ValidationReport });
export const IntegrationsResponse = z.object({
  integrations: z.array(z.object({ name: z.string(), status: z.string(), detail: z.string() })),
});
