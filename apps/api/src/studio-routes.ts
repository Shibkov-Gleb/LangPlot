import { randomUUID } from 'node:crypto';
import { Prisma, type StudioJob } from '@prisma/client';
import { createCourseGraph, LocalCourseProvider } from '@langplot/agents';
import {
  ContentPackage,
  ImportResponse,
  IntegrationsResponse,
  JobResponse,
  JobsResponse,
  StudioInput,
  ValidationReport,
  validatePackage,
} from '@langplot/shared';
import { app } from './app.js';
import { db } from './db.js';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { requireUser, requireStaff } from './session.js';
import { importPackage } from './content-service.js';
const jobDto = (job: StudioJob) => ({ ...job, createdAt: job.createdAt.toISOString() });
const json = (value: unknown) => value as Prisma.InputJsonValue;
let processing = false;
export async function recoverJobs() {
  await db.studioJob.updateMany({
    where: { status: { in: ['queued', 'running'] } },
    data: { status: 'interrupted', error: 'Сервер был перезапущен. Запустите задание повторно.' },
  });
}
async function pump() {
  if (processing) return;
  processing = true;
  try {
    for (;;) {
      const job = await db.studioJob.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (!job) break;
      const claimed = await db.studioJob.updateMany({
        where: { id: job.id, status: 'queued' },
        data: { status: 'running' },
      });
      if (!claimed.count) continue;
      try {
        const graph = createCourseGraph(new LocalCourseProvider(), async (stage) => {
          await db.studioJob.update({ where: { id: job.id }, data: { stage } });
        });
        const parsed = StudioInput.parse(jobDtoInput(job));
        const result = await graph.invoke(
          { input: { ...parsed, packageId: `draft.${randomUUID()}` } },
          { callbacks: [], signal: AbortSignal.timeout(30000) },
        );
        await db.studioJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            stage: 'done',
            output: json(result.draft),
            report: json(result.report),
            error: null,
          },
        });
      } catch (error) {
        await db.studioJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Не удалось подготовить черновик.',
          },
        });
      }
    }
  } finally {
    processing = false;
  }
}
const jobDtoInput = (job: StudioJob) => ({
  brief: job.brief,
  language: job.language,
  level: job.level,
});
export function registerStudioRoutes() {
  app.use('/api/studio', requireUser, requireStaff);
  app.get('/api/studio/integrations', (_req, res) =>
    res.json(
      IntegrationsResponse.parse({
        integrations: [
          {
            name: 'Переписка · LangChain',
            status: config.CHAT_PROVIDER === 'local' ? 'Локальный провайдер' : 'Не настроено',
            detail: 'Предсказуемые тестовые ответы',
          },
          {
            name: 'Курсы · LangGraph',
            status: config.COURSE_PROVIDER === 'local' ? 'Локальный провайдер' : 'Не настроено',
            detail: 'Пустой черновик без учебного контента',
          },
          {
            name: 'Озвучка · TTS',
            status: 'Не настроено',
            detail: 'Интерфейс провайдера подготовлен',
          },
          {
            name: 'Файловое хранилище',
            status: 'Локально',
            detail: 'Интерфейс для российского S3 подготовлен',
          },
        ],
      }),
    ),
  );
  app.get('/api/studio/jobs', async (req, res) =>
    res.json(
      JobsResponse.parse({
        jobs: (
          await db.studioJob.findMany({
            where: req.user!.role === 'SUPERADMIN' ? {} : { userId: req.user!.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        ).map(jobDto),
      }),
    ),
  );
  app.post('/api/studio/jobs', async (req, res) => {
    if (config.COURSE_PROVIDER === 'none')
      throw new ApiError(503, 'MODEL_NOT_CONFIGURED', 'Провайдер подготовки курсов не настроен.');
    const input = StudioInput.parse(req.body);
    if (
      (await db.studioJob.count({
        where: { userId: req.user!.id, status: { in: ['running', 'queued'] } },
      })) >= 3
    )
      throw new ApiError(429, 'QUEUE_FULL', 'Подождите завершения текущих заданий.');
    const job = await db.studioJob.create({ data: { ...input, userId: req.user!.id } });
    res.status(202).json(JobResponse.parse({ job: jobDto(job) }));
    void pump().catch(console.error);
  });
  app.post('/api/studio/jobs/:id/retry', async (req, res) => {
    const job = await db.studioJob.findFirst({
      where: {
        id: String(req.params.id),
        userId: req.user!.role === 'SUPERADMIN' ? undefined : req.user!.id,
      },
    });
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Задание не найдено.');
    if (!['failed', 'interrupted'].includes(job.status))
      throw new ApiError(409, 'JOB_NOT_RETRYABLE', 'Это задание нельзя запустить повторно.');
    if (config.COURSE_PROVIDER === 'none')
      throw new ApiError(503, 'MODEL_NOT_CONFIGURED', 'Провайдер не настроен.');
    const claimed = await db.studioJob.updateMany({
      where: { id: job.id, status: { in: ['failed', 'interrupted'] } },
      data: { status: 'queued', stage: 'brief', error: null },
    });
    if (!claimed.count) throw new ApiError(409, 'JOB_NOT_RETRYABLE', 'Задание уже перезапущено.');
    res.json(
      JobResponse.parse({
        job: jobDto(await db.studioJob.findUniqueOrThrow({ where: { id: job.id } })),
      }),
    );
    void pump().catch(console.error);
  });
  app.post('/api/studio/validate', (req, res) =>
    res.json(ValidationReport.parse(validatePackage(req.body))),
  );
  app.post('/api/studio/import', async (req, res) =>
    res.json(ImportResponse.parse(await importPackage(req.body))),
  );
  app.post('/api/studio/publish', (req, res) => {
    const report = validatePackage(req.body, 'publish');
    if (!report.valid) throw new ApiError(400, 'NOT_PUBLISHABLE', report.errors.join('\n'));
    throw new ApiError(501, 'PUBLISH_NOT_CONFIGURED', 'Публикация курсов пока не подключена.');
  });
  app.get('/api/studio/jobs/:id/export', async (req, res) => {
    const job = await db.studioJob.findFirst({
      where: {
        id: String(req.params.id),
        userId: req.user!.role === 'SUPERADMIN' ? undefined : req.user!.id,
        status: 'completed',
      },
    });
    if (!job?.output) throw new ApiError(404, 'EXPORT_NOT_FOUND', 'Черновик ещё не готов.');
    const content = ContentPackage.parse(job.output);
    res
      .type('application/json')
      .attachment(`${content.manifest.id}-${content.manifest.version}.json`)
      .send(JSON.stringify(content, null, 2));
  });
}
