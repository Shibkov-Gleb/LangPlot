import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

async function capture(page: Page, info: TestInfo, name: string) {
  const directory = process.env.LANGPLOT_SCREEN_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(directory, name + '.png'),
    animations: 'disabled',
    fullPage: true,
  });
}
test('Последний ряд: обе ветки, сохранение, подсказки и личный телефон', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(150000);
  process.loadEnvFile(path.resolve('.env'));
  const db = new PrismaClient(),
    token = randomBytes(32).toString('hex');
  const actor = await db.user.create({
    data: {
      email: randomBytes(12).toString('hex') + '@playwright.invalid',
      passwordHash: 'fixture',
      name: 'Исследователь',
      language: 'en',
      level: 'A2',
      reducedMotion: true,
    },
  });
  const thirdParty = new Set<string>();
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host && !['127.0.0.1', 'localhost', 'me.kis.v2.scr.kaspersky-labs.com'].includes(host))
      thirdParty.add(host);
  });
  try {
    await page.goto('/play/last-row');
    await expect(page).toHaveURL(/login\?lesson=last-row/);
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dashboard/materials/last-row');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('после завершения урока');
    await page.getByRole('link', { name: 'Все материалы' }).click();
    await expect(
      page.getByRole('heading', { name: 'Первый урок откроет вашу коллекцию' }),
    ).toBeVisible();
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Открыть курс' }).click();
    await expect(page).toHaveURL(/\/courses\/en\/a2$/);
    await expect(page.locator('.course-lessons > li')).toHaveCount(90);
    await expect(page.getByText('Теория после прохождения', { exact: true })).toHaveCount(105);
    await page.locator('.course-section').last().locator('summary').click();
    await expect(page.getByRole('heading', { name: 'Никто не подсказывал' })).toBeVisible();
    await page
      .locator('.course-lessons>li')
      .first()
      .getByRole('link', { name: 'Начать урок' })
      .click();
    const desktop = info.project.name === 'desktop-1440',
      mobile = info.project.name === 'mobile-375';
    const button = (s: string) => page.getByRole('button', { name: s, exact: true });
    const next = () => button('Дальше').click();
    const option = (s: string) => page.locator('.lr-options button').filter({ hasText: s }).click();
    const chat = page.getByRole('log', { name: 'Переписка с Мэй' });
    const reply = "Thanks, Lev. I'll check the station log.";
    for (const branch of ['keep', 'give']) {
      await expect(page.getByRole('heading', { name: 'Последний ряд' })).toBeVisible();
      if (desktop && branch === 'keep') await capture(page, info, '01-arrival');
      await button('Войти в историю').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.lr-speech')).toContainText('Last stop. Is this yours?');
      if (branch === 'keep') {
        await button('Last stop').click();
        await expect(page.getByRole('dialog', { name: 'Перевод слова' })).toContainText(
          'конечная остановка',
        );
        if (desktop) await capture(page, info, '02-translation');
        await page.keyboard.press('Escape');
        await expect(button('Last stop')).toBeFocused();
        await button('Выключить звук').click();
        await expect(button('Включить звук')).toBeVisible();
      }
      for (let i = 0; i < 9; i++) {
        if (i === 4) {
          await expect(page.locator('.lr-last-seat .lr-speech')).toHaveText('Here.');
          await expect(page.locator('.lr-portrait')).toHaveCount(0);
        }
        if (i === 0) {
          await page.keyboard.press('ArrowRight');
          await expect(page.locator('.lr-speech')).toContainText('Mine are in my bag');
        } else await next();
      }
      await expect(page.locator('.lr-options')).toBeVisible();
      await page.keyboard.press('1');
      await expect(page.getByRole('status')).toContainText("We're on the bus right now");
      await page.keyboard.press('2');
      await button('am taking').click();
      await expect(page.getByRole('dialog', { name: 'Пояснение грамматики' })).toContainText(
        'Present Continuous',
      );
      if (desktop && branch === 'keep') await capture(page, info, '03-grammar');
      await page.keyboard.press('Escape');
      await next();
      if (desktop && branch === 'keep') await capture(page, info, '05-ticket-choice');
      await option(branch === 'keep' ? "I'll keep my ticket." : 'You can have my ticket.');
      await page.reload();
      await expect(page.locator('.lr-speech')).toContainText(
        branch === 'keep' ? 'Fold it once' : 'under this glove',
      );
      if (branch === 'keep') {
        await button('Билет').click();
        await expect(page.getByRole('dialog')).toContainText('6:10 PM');
        await page.keyboard.press('Escape');
      }
      await next();
      await next();
      for (const terms of [
        ['public transport', 'passenger', 'platform', 'timetable', 'route'],
        ['fare', 'single ticket', 'return ticket', 'ticket office', 'bus stop'],
        ['coach', 'tram', 'subway', 'railroad'],
      ]) {
        for (const term of terms) {
          await button(term).click();
          await expect(page.getByRole('dialog', { name: 'Перевод слова' })).toContainText(term);
          await page.keyboard.press('Escape');
        }
        await next();
      }
      if (desktop && branch === 'keep') await capture(page, info, '04-word-insert');
      for (const term of ['passenger', 'timetable', 'fare', 'ticket office', 'coach', 'subway'])
        await option(term);
      const greeting =
        branch === 'keep'
          ? "Hi, Lev. It's Mae. What time is on your ticket?"
          : "Hi, Lev. It's Mae. Did you give Owen your ticket?";
      await expect(chat.getByText(greeting, { exact: true })).toHaveCount(1);
      await expect(button('Завершить урок')).toBeDisabled();
      const text = branch === 'keep' ? 'My ticket says 6:10 PM.' : 'Yes. Owen has my ticket.';
      await page.getByRole('textbox', { name: 'Сообщение Мэй' }).fill(text);
      await button('Отправить сообщение').click();
      await expect(chat.getByText(reply, { exact: true })).toBeVisible();
      await page.reload();
      await expect(chat.getByText(greeting, { exact: true })).toHaveCount(1);
      await expect(chat.getByText(text, { exact: true })).toHaveCount(1);
      if (mobile && branch === 'give') await capture(page, info, '06-mae-mobile');
      await button('Завершить урок').click();
      await expect(page.getByRole('heading', { name: 'Конец смены' })).toBeVisible();
      if (branch === 'keep') {
        await page.getByRole('link', { name: 'Теория урока', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Последний ряд' })).toBeVisible();
        await expect(page.locator('#vocabulary dt')).toHaveCount(23);
        await expect(
          page
            .locator('#grammar')
            .getByRole('article', { name: /Present Simple и Present Continuous/ }),
        ).toHaveCount(1);
        await expect(page.locator('#vocabulary')).toContainText('glove');
        await expect(page.locator('#vocabulary')).toContainText(
          "Then I'll put it under this glove.",
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        if (desktop || mobile)
          await page.screenshot({
            path: info.outputPath('lesson-theory.png'),
            animations: 'disabled',
          });
        await page.getByRole('link', { name: /Грамматика 1/ }).click();
        await expect(page.locator('#grammar')).toBeInViewport();
        await expect(page.locator('#grammar')).toContainText('Today I am taking the bus.');
        await page.reload();
        await expect(page.locator('#grammar')).toContainText('Present Continuous');
        await expect(page.locator('#grammar')).toBeInViewport();
        await page.getByRole('link', { name: 'Все материалы' }).click();
        await page.getByRole('link', { name: /Последний ряд/ }).click();
        await page.getByRole('link', { name: 'К урокам курса' }).click();
        await expect(page.getByRole('link', { name: 'Теория урока' })).toBeVisible();
        if (desktop || mobile)
          await page.screenshot({
            path: info.outputPath('course-overview.png'),
            animations: 'disabled',
          });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await button('Пройти ещё раз').click();
        await expect(page.getByRole('heading', { name: 'Последний ряд' })).toBeVisible();
        await button('Журнал').click();
        await page.getByRole('dialog').getByRole('link', { name: 'Теория урока' }).click();
        await expect(page.locator('#vocabulary dt')).toHaveCount(23);
        await page.getByRole('link', { name: 'К урокам курса' }).click();
        await expect(page.getByRole('link', { name: 'Теория урока' })).toBeVisible();
        await page.getByRole('link', { name: 'Продолжить', exact: true }).click();
      }
    }
    await button('Журнал').click();
    await page.getByRole('button', { name: /Рейс 01/ }).click();
    await expect(chat).toContainText('My ticket says 6:10 PM.');
    await expect(button('К текущему прохождению')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect([...thirdParty]).toEqual([]);
  } finally {
    await db.user.deleteMany({ where: { id: actor.id } });
    await db.$disconnect();
  }
});
