import { test, expect } from '@playwright/test';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PlayablePackage, ContentPackageV2 } from '../../packages/shared/src/content';
const catalog = JSON.parse(readFileSync('content/courses/catalog.json', 'utf8'));
const rows = catalog[0].sections[0].lessons as { number: number; slug: string }[];
test('plays chapters 2–15 with their own contacts, theory and saved decisions', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(480000);
  process.loadEnvFile(path.resolve('.env'));
  const db = new PrismaClient(),
    token = randomBytes(32).toString('hex');
  const actor = await db.user.create({
    data: {
      email: randomBytes(12).toString('hex') + '@playwright.invalid',
      passwordHash: 'fixture',
      name: 'Первый акт',
      language: 'en',
      level: 'A2',
      sound: false,
      reducedMotion: true,
    },
  });
  const external = new Set<string>(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host && !['localhost', '127.0.0.1', 'me.kis.v2.scr.kaspersky-labs.com'].includes(host))
      external.add(host);
  });
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
    const original = ContentPackageV2.parse(
      JSON.parse(readFileSync('content/lessons/last-row.json', 'utf8')),
    );
    const v = await db.contentVersion.upsert({
      where: {
        packageId_version: { packageId: original.manifest.id, version: original.manifest.version },
      },
      update: {},
      create: {
        packageId: original.manifest.id,
        version: original.manifest.version,
        language: 'en',
        level: 'A2',
        data: JSON.parse(JSON.stringify(original)),
      },
    });
    await db.playthrough.create({
      data: {
        userId: actor.id,
        contentVersionId: v.id,
        language: 'en',
        state: {
          sceneId: 'end',
          flags: { kept: true },
          visited: ['end'],
          choices: [],
          journal: [],
        },
      },
    });
    for (const row of rows.slice(1)) {
      const content = PlayablePackage.parse(
        JSON.parse(readFileSync('content/lessons/' + row.slug + '.json', 'utf8')),
      );
      if (content.schemaVersion !== 3) throw new Error('Expected v3');
      const contact = content.characters.find((c) => c.id === content.lesson.contact)!.name;
      const chosen = row.number % 2 === 0 ? 'choose-a' : 'choose-b';
      const start = page.waitForResponse((r) =>
        r.url().endsWith('/api/lessons/' + row.slug + '/plays'),
      );
      await page.goto('/play/' + row.slug);
      let play = (await (await start).json()).play;
      await expect(page.getByRole('heading', { name: content.manifest.title })).toBeVisible();
      for (let step = 0; step < 90; step++) {
        const scene = content.scenes.find((s) => s.id === play.state.sceneId)!;
        if (scene.terminal) break;
        if (row.number === 5 && scene.id === 'ticket-kept-1')
          await expect(page.locator('.lr-speech')).toHaveText(
            'This is the ticket I kept. The flat sides match.',
          );
        if (row.number === 2 && scene.layout === 'reading' && scene.marks.length) {
          const mark = scene.marks[0]!;
          const note = content.lesson.notes.find((n) => n.key === mark.note)!;
          await page
            .locator('.lr-speech')
            .getByRole('button', { name: mark.text, exact: true })
            .first()
            .click();
          await expect(page.getByRole('dialog', { name: 'Перевод слова' })).toContainText(
            note.meaning,
          );
          await page.keyboard.press('Escape');
        }
        if (scene.layout === 'phone') {
          const log = page.getByRole('log');
          await expect(
            log.getByText(content.lesson.openings[chosen === 'choose-a' ? 0 : 1], { exact: true }),
          ).toHaveCount(1);
          await expect(page.locator('.lr-phone header')).toContainText(contact);
          await page
            .getByRole('textbox', { name: 'Сообщение — ' + contact })
            .fill('I wrote it in my notes. Can we check it together?');
          await page.getByRole('button', { name: 'Отправить сообщение' }).click();
          await expect(log.getByText(content.lesson.reply, { exact: true })).toHaveCount(1);
          if (info.project.name === 'mobile-375' && row.number === 15)
            await page.screenshot({
              path: info.outputPath('phone-15.png'),
              animations: 'disabled',
              fullPage: true,
            });
        }
        const option = scene.exercise
          ? scene.choices.find((c) => c.id === scene.exercise!.correct)!
          : scene.layout === 'choice'
            ? scene.choices.find((c) => c.id === chosen)!
            : scene.choices[0]!;
        if (
          row.number === 2 &&
          scene.layout === 'task' &&
          !scene.exercise?.review &&
          scene.phase === 'grammar'
        ) {
          const wrong = scene.choices.find((c) => c.id !== option.id)!;
          const pending = page.waitForResponse(
            (r) => r.url().endsWith('/actions') && r.request().method() === 'POST',
          );
          await page.locator('.lr-options').getByText(wrong.label, { exact: true }).click();
          await pending;
          await expect(page.locator('.lr-feedback')).toContainText(scene.exercise!.feedback);
        }
        const pending = page.waitForResponse(
          (r) => r.url().endsWith('/actions') && r.request().method() === 'POST',
        );
        const button =
          scene.layout === 'arrival'
            ? page.getByRole('button', { name: 'Войти в историю' })
            : scene.layout === 'phone'
              ? page.getByRole('button', { name: 'Завершить урок' })
              : ['task', 'choice'].includes(scene.layout)
                ? page.locator('.lr-options').getByText(option.label, { exact: true })
                : page.getByRole('button', { name: 'Дальше', exact: true });
        await button.click();
        const response = await pending;
        expect(response.status(), row.slug + ' / ' + scene.id).toBe(200);
        play = (await response.json()).play;
        if (row.number === 2 && scene.id === 'grammar') {
          const mark = page.locator('.lr-speech button').first();
          if (await mark.count()) {
            await mark.click();
            await expect(page.getByRole('dialog', { name: 'Пояснение грамматики' })).toContainText(
              'mine',
            );
            await page.keyboard.press('Escape');
          }
        }
        if (scene.layout === 'choice') {
          const state = play.state.sceneId;
          await page.reload();
          await expect(page.locator('.lr-speech')).toHaveText(
            content.scenes.find((s) => s.id === state)!.text,
          );
        }
        if (
          info.project.name === 'desktop-1440' &&
          [2, 5, 15].includes(row.number) &&
          play.state.sceneId === 'line-1'
        )
          await page.screenshot({
            path: info.outputPath('chapter-' + row.number + '.png'),
            animations: 'disabled',
          });
      }
      expect(play.state.sceneId, row.slug).toBe('end');
      await expect(
        page.getByRole('heading', { name: content.lesson.presentation.finishTitle }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Теория урока', exact: true }).click();
      await expect(page.locator('.theory-entry')).toHaveCount(content.lesson.notes.length);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await page.goto('/dashboard/materials');
    await expect(page.locator('.material-links>li')).toHaveCount(15);
    await page.goto('/courses/en/a2');
    await expect(page.getByRole('button', { name: 'Пройти ещё раз', exact: true })).toHaveCount(15);
    await expect(page.locator('.planned-lesson')).toHaveCount(0);
    expect([...external]).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await db.user.delete({ where: { id: actor.id } });
    await db.$disconnect();
  }
});
