import { test, expect } from '@playwright/test';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StudyGuide } from '../../packages/shared/src/study-guide';
import { CourseResponse, TheoryResponse } from '../../packages/shared/src/courses';
import { PlayablePackage } from '../../packages/shared/src/content';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const guide = StudyGuide.parse(read('content/courses/en-a2-study-guide.json'));

test('shows lesson topics and all grammar articles, including previously completed versions', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(240000);
  process.loadEnvFile(path.resolve('.env'));
  const db = new PrismaClient();
  const actor = await db.user.create({
    data: { name: 'Проверка справочника', language: 'en', level: 'A2' },
  });
  const token = randomBytes(32).toString('hex');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await db.session.create({
      data: {
        userId: actor.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await context.addCookies([
      {
        name: 'langplot_session',
        value: token,
        domain: new URL(baseURL!).hostname,
        path: '/api',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const course = CourseResponse.parse(
      await (await context.request.get('/api/courses/en/a2')).json(),
    );
    expect(course.lessons).toHaveLength(90);
    const entries = course.lessons.flatMap((l) => l.routeLessons ?? [l]);
    expect(entries).toHaveLength(105);
    for (const lesson of entries) {
      expect(lesson.topics!.grammar).toEqual(
        guide.lessons[lesson.slug!]!.grammarKeys.map(
          (key) => guide.grammar.find((g) => g.key === key)!.title,
        ),
      );
      expect(lesson.topics!.vocabulary).toEqual(guide.lessons[lesson.slug!]!.vocabulary);
    }
    expect((await context.request.get('/api/lessons/last-row/theory')).status()).toBe(403);

    await page.goto('/courses/en/a2');
    await expect(page.getByRole('heading', { name: 'Уроки курса' })).toBeVisible();
    await expect(page.locator('.course-lessons .study-topics')).toHaveCount(105);
    await expect(page.locator('.course-lessons > li').first()).toContainText(
      'Общественный транспорт и маршрут',
    );
    await page.screenshot({ path: info.outputPath('lesson-topics.png') });
    const routes = page.locator('.course-section').nth(2);
    await routes.locator('summary').click();
    await routes.locator('.course-route').first().scrollIntoViewIfNeeded();
    await expect(routes.locator('.course-route .study-topics').first()).toBeVisible();
    await page.screenshot({ path: info.outputPath('route-topics.png') });

    // One real completed attempt for each grammar topic; the first keeps an older lesson version.
    const representatives = new Map<string, string>();
    for (const [slug, entry] of Object.entries(guide.lessons))
      for (const key of entry.grammarKeys)
        if (!representatives.has(key)) representatives.set(key, slug);
    for (const slug of new Set(representatives.values())) {
      const content = PlayablePackage.parse(read('content/lessons/' + slug + '.json'));
      if (slug === 'last-row') {
        content.manifest.version = '0.8.88';
        content.lesson.notes.find((n) => n.kind === 'grammar')!.meaning =
          'Краткая заметка из завершённой версии.';
      }
      const version = await db.contentVersion.upsert({
        where: {
          packageId_version: { packageId: content.manifest.id, version: content.manifest.version },
        },
        update: {},
        create: {
          packageId: content.manifest.id,
          version: content.manifest.version,
          language: 'en',
          level: 'A2',
          data: JSON.parse(JSON.stringify(content)),
        },
      });
      await db.playthrough.create({
        data: {
          userId: actor.id,
          contentVersionId: version.id,
          language: 'en',
          state: { sceneId: 'end', flags: {}, visited: ['end'], choices: [], journal: [] },
        },
      });
    }
    const first = TheoryResponse.parse(
      await (await context.request.get('/api/lessons/last-row/theory')).json(),
    );
    expect(first.notes.find((n) => n.kind === 'grammar')!.meaning).toBe(
      'Краткая заметка из завершённой версии.',
    );
    expect(first.grammarGuides[0]!.sections.length).toBeGreaterThan(1);

    for (const [key, slug] of representatives) {
      const article = guide.grammar.find((g) => g.key === key)!;
      await page.goto('/dashboard/materials/' + slug + '#grammar');
      await expect(page.getByRole('heading', { name: article.title, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Частые ошибки', exact: true })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Как проверить себя', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.grammar-article table')).toHaveCount(
        article.sections.filter((s) => s.table).length,
      );
      await expect(page.locator('.grammar-examples li')).toHaveCount(
        article.sections.flatMap((s) => s.examples).length,
      );
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.page, key + ' must not overflow the page').toBeLessThanOrEqual(
        dimensions.width,
      );
      if (['g04', 'g30', 'g32'].includes(key)) {
        await page
          .getByRole('heading', { name: article.title, exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('grammar-' + key + '.png') });
      }
      if (key === 'g30') {
        const table = page.getByRole('region', { name: 'Направление и траектория — таблица' });
        await table.focus();
        await expect(table).toBeFocused();
        await page.keyboard.press('ArrowRight');
        if (info.project.name === 'mobile-375')
          await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      }
    }
    await page.reload();
    await expect(page.locator('.grammar-article')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await db.user.delete({ where: { id: actor.id } });
    await db.$disconnect();
  }
});
