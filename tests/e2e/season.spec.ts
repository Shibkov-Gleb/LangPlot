import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PlayablePackage } from '../../packages/shared/src/content';
import { decisionFlag, lessonScene } from '../../packages/shared/src/lesson-engine';
const catalog = JSON.parse(readFileSync('content/courses/catalog.json', 'utf8'))[0];
const rows = catalog.sections.flatMap(
  (section: { lessons: { number: number; slug: string; routes?: { slug: string }[] }[] }) =>
    section.lessons.flatMap((row) =>
      (row.routes ?? [row]).map((v) => ({ number: row.number, slug: v.slug })),
    ),
);
const load = (slug: string) =>
  PlayablePackage.parse(JSON.parse(readFileSync('content/lessons/' + slug + '.json', 'utf8')));
async function setup(context: BrowserContext, baseURL: string) {
  process.loadEnvFile(path.resolve('.env'));
  const db = new PrismaClient(),
    token = randomBytes(32).toString('hex');
  const actor = await db.user.create({
    data: {
      email: randomBytes(12).toString('hex') + '@playwright.invalid',
      passwordHash: 'fixture',
      name: 'Полный сезон',
      language: 'en',
      level: 'A2',
      sound: false,
      reducedMotion: true,
    },
  });
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
      domain: new URL(baseURL).hostname,
      path: '/api',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  async function seed(slug: string, flags: Record<string, boolean>) {
    const c = load(slug),
      v = await db.contentVersion.upsert({
        where: { packageId_version: { packageId: c.manifest.id, version: c.manifest.version } },
        update: {},
        create: {
          packageId: c.manifest.id,
          version: c.manifest.version,
          language: 'en',
          level: 'A2',
          data: JSON.parse(JSON.stringify(c)),
        },
      });
    await db.playthrough.create({
      data: {
        userId: actor.id,
        contentVersionId: v.id,
        language: 'en',
        state: { sceneId: 'end', flags, visited: ['phone', 'end'], choices: [], journal: [] },
      },
    });
  }
  return {
    db,
    actor,
    seed,
    async close() {
      await db.user.delete({ where: { id: actor.id } });
      await db.$disconnect();
    },
  };
}
async function playChapter(
  page: Page,
  slug: string,
  ending = 'h',
  shot?: (name: string) => Promise<void>,
  makeError: boolean | string = false,
) {
  const content = load(slug);
  const opened = page.waitForResponse((r) => r.url().endsWith('/api/lessons/' + slug + '/plays'));
  await page.goto('/play/' + slug);
  let play = (await (await opened).json()).play;
  if (play.view.layout === 'end') {
    const replay = page.waitForResponse((r) => r.url().endsWith('/replay'));
    await page.getByRole('button', { name: 'Пройти ещё раз', exact: true }).click();
    play = (await (await replay).json()).play;
  }
  await expect(page.getByRole('heading', { name: content.manifest.title })).toBeVisible();
  for (let step = 0; step < 100; step++) {
    const scene = lessonScene(content, play.state.sceneId)!;
    if (scene.terminal) break;
    if (scene.id === 'ending-choice') {
      if (shot) await shot('ending-options');
      expect(play.view.choices.map((x: { id: string }) => x.id)).toContain('ending-' + ending);
    }
    if (scene.layout === 'phone') {
      const log = page.getByRole('log');
      await expect(log.locator('.incoming').first()).not.toBeEmpty();
      await page
        .getByRole('textbox', { name: /Сообщение —/ })
        .fill('I wrote what I saw. Can we check the last line together?');
      await page.getByRole('button', { name: 'Отправить сообщение' }).click();
      await expect(log.locator('.outgoing')).toHaveCount(1);
      if (slug === 'episode-90' && shot) await shot('final-phone-' + ending);
    }
    const chosen =
      scene.id === 'ending-choice'
        ? 'ending-' + ending
        : scene.layout === 'choice'
          ? 'choose-a'
          : (scene.exercise?.correct ?? scene.choices[0]!.id);
    if (scene.exercise?.skill === 'v25.04') {
      await expect(page.locator('.lr-speech')).toContainText(
        'one performance on a small stage. Children',
      );
      await expect(page.locator('.lr-speech')).not.toContainText('…ance');
    }
    if (
      makeError &&
      scene.exercise &&
      !scene.exercise.review &&
      (makeError === true || scene.exercise.skill === makeError)
    ) {
      const bad = scene.choices.find((c) => c.id !== chosen)!;
      const response = page.waitForResponse((r) => r.url().endsWith('/actions'));
      await page.locator('.lr-options').getByText(bad.label, { exact: true }).click();
      const badPlay = (await (await response).json()).play;
      expect(badPlay.state.sceneId).toBe(scene.id);
      await expect(page.locator('.lr-feedback')).toBeVisible();
      makeError = false;
    }
    const option = scene.choices.find((c) => c.id === chosen)!;
    const next = page.waitForResponse((r) => r.url().endsWith('/actions'));
    const button =
      scene.layout === 'arrival'
        ? page.getByRole('button', { name: 'Войти в историю' })
        : scene.layout === 'phone'
          ? page.getByRole('button', { name: 'Завершить урок' })
          : ['task', 'choice'].includes(scene.layout)
            ? page.locator('.lr-options').getByText(option.label, { exact: true })
            : page.getByRole('button', { name: 'Дальше', exact: true });
    await button.click();
    const res = await next;
    expect(res.status(), slug + '/' + scene.id).toBe(200);
    play = (await res.json()).play;
    if (shot && scene.layout === 'arrival') await shot(slug);
  }
  expect(play.state.sceneId).toBe('end');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  return play;
}
test('plays every remaining chapter and both investigation routes', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'Полное прохождение выполняется на компьютере.');
  test.setTimeout(1800000);
  const actor = await setup(context, baseURL!);
  const errors: string[] = [],
    external = new Set<string>();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host && !['localhost', '127.0.0.1', 'me.kis.v2.scr.kaspersky-labs.com'].includes(host))
      external.add(host);
  });
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(name + '.png'),
      animations: 'disabled',
      fullPage: true,
    });
  };
  try {
    for (const row of rows.filter((r: { number: number }) => r.number <= 15)) {
      const c = load(row.slug);
      await actor.seed(row.slug, { [decisionFlag(c)]: true });
    }
    for (const row of rows.filter((r: { number: number }) => r.number >= 16)) {
      await playChapter(
        page,
        row.slug,
        'h',
        [16, 31, 45, 73, 85, 90].includes(row.number) ? shot : undefined,
        row.number === 16,
      );
      await page.getByRole('link', { name: 'Теория урока', exact: true }).click();
      await expect(page.locator('.theory-entry')).toHaveCount(load(row.slug).lesson.notes.length);
      console.log('Пройден', row.slug);
    }
    await page.goto('/courses/en/a2');
    await expect(page.locator('.course-lessons>li')).toHaveCount(90);
    await expect(page.locator('.course-route')).toHaveCount(30);
    await expect(
      page.getByRole('button', { name: 'Пройти ещё раз', exact: true, includeHidden: true }),
    ).toHaveCount(105);
    await shot('complete-course');
    await page.goto('/play/episode-90');
    const openedReview = page.waitForResponse((r) => r.url().endsWith('/review'));
    await page.getByRole('button', { name: 'Повторить ошибки из журнала' }).click();
    let review = (await (await openedReview).json()).play;
    await expect(page.locator('.lr-card')).toContainText('Журнал');
    for (let i = 0; i < 2 && review.state.sceneId !== 'end'; i++) {
      const scene = lessonScene(load('episode-90'), review.state.sceneId)!;
      const result = page.waitForResponse((r) => r.url().endsWith('/actions'));
      await page
        .locator('.lr-options')
        .getByText(scene.choices.find((c) => c.id === scene.exercise!.correct)!.label, {
          exact: true,
        })
        .click();
      review = (await (await result).json()).play;
    }
    await expect(page.getByRole('heading', { name: 'Журнал сверен' })).toBeVisible();
    await expect(page.locator('.lr-phone')).toHaveCount(0);
    await shot('post-season-review');
    expect(errors).toEqual([]);
    expect([...external]).toEqual([]);
  } finally {
    await actor.close();
  }
});
test('plays all three ending sequences on a mobile screen', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'mobile-375', 'Развязки проверяются на телефоне.');
  test.setTimeout(600000);
  const actor = await setup(context, baseURL!);
  const shot = async (name: string) => {
    await page.screenshot({
      path: info.outputPath(name + '.png'),
      animations: 'disabled',
      fullPage: true,
    });
  };
  try {
    await actor.seed('episode-21', { 'e21.a': true });
    await actor.seed('episode-24', { 'e24.a': true });
    for (const ending of ['h', 'f', 'p']) {
      for (let n = 85; n <= 90; n++)
        await playChapter(page, 'episode-' + n, ending, n === 85 || n === 90 ? shot : undefined);
      await expect(page.locator('.lr-phone header')).toContainText(
        ending === 'h' ? 'Мэй Роу' : ending === 'f' ? 'Нэлл Дейл' : 'Илья Сомов',
      );
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Сезон завершён' })).toBeVisible();
    }
  } finally {
    await actor.close();
  }
});
test('keeps performance complete in both lesson 34 routes and the final review bank', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop-1440');
  test.setTimeout(180000);
  const actor = await setup(context, baseURL!);
  try {
    await playChapter(page, 'episode-34d', 'p', undefined, 'v25.04');
    await playChapter(page, 'episode-34f', 'p');
    await actor.seed('episode-90', { 'ending.h': false, 'ending.f': false });
    await page.goto('/play/episode-90');
    await page.getByRole('button', { name: 'Повторить ошибки из журнала' }).click();
    await expect(page.locator('.lr-speech')).toContainText(
      'one performance on a small stage. Children',
    );
    await expect(page.locator('.lr-speech')).not.toContainText('…ance');
    await page.locator('.lr-options').getByText('perform', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Журнал сверен' })).toBeVisible();
  } finally {
    await actor.close();
  }
});

test('opens all completed results and reconstructs two old errors after the finale', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop-1440');
  test.setTimeout(180000);
  const actor = await setup(context, baseURL!);
  try {
    for (const row of rows) {
      const c = load(row.slug);
      await actor.seed(row.slug, {
        [decisionFlag(c)]: true,
        'story.route-f': row.slug.endsWith('f'),
        'owen.alive': true,
        'ending.h': true,
        'ending.f': false,
      });
    }
    await actor.db.skillState.createMany({
      data: ['v25.04', 'v39.13'].map((skillId) => ({
        userId: actor.actor.id,
        language: 'en',
        skillId,
        attempts: 1,
        successes: 0,
        reviewDueAt: new Date(Date.now() - 1000),
      })),
    });
    await page.goto('/courses/en/a2');
    await expect(page.locator('.course-counts')).toContainText('Пройдено 90');
    await expect(
      page.getByRole('button', { name: 'Пройти ещё раз', exact: true, includeHidden: true }),
    ).toHaveCount(105);
    await page.screenshot({
      path: info.outputPath('complete-course.png'),
      animations: 'disabled',
      fullPage: true,
    });
    await page.locator('.course-section').nth(2).locator('summary').click();
    await expect(page.locator('.course-route').first()).toBeVisible();
    await page.locator('.course-section').nth(2).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('two-routes.png'), animations: 'disabled' });
    await page.goto('/play/episode-90');
    const response = page.waitForResponse((r) => r.url().endsWith('/review'));
    await page.getByRole('button', { name: 'Повторить ошибки из журнала' }).click();
    let review = (await (await response).json()).play;
    const c = load('episode-90');
    for (let i = 0; i < 2; i++) {
      const scene = lessonScene(c, review.state.sceneId)!;
      const option = scene.choices.find((c) => c.id === scene.exercise!.correct)!;
      await expect(page.locator('.lr-speech')).not.toContainText('…ance');
      await expect(page.locator('.lr-speech')).not.toContainText('…ature');
      const action = page.waitForResponse((r) => r.url().endsWith('/actions'));
      await page.locator('.lr-options').getByText(option.label, { exact: true }).click();
      review = (await (await action).json()).play;
    }
    await expect(page.getByRole('heading', { name: 'Журнал сверен' })).toBeVisible();
    await expect(page.locator('.lr-phone')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('post-season-review.png'),
      animations: 'disabled',
      fullPage: true,
    });
  } finally {
    await actor.close();
  }
});
