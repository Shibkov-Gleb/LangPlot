import { expect, test } from '@playwright/test';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

test('с главной можно пройти полный первый урок до регистрации и сохранить его в аккаунте', async ({
  page,
  context,
}, info) => {
  test.setTimeout(145000);
  process.loadEnvFile('.env');
  const db = new PrismaClient();
  const email = randomUUID() + '@playwright.invalid';
  let guestId: string | undefined;
  const btn = (name: string) => page.getByRole('button', { name, exact: true });
  const next = () => btn('Дальше').click();
  const option = (name: string) =>
    page.locator('.lr-options button').filter({ hasText: name }).click();
  const signUp = page.getByRole('link', { name: 'Сохранить урок и зарегистрироваться' });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: 'Выбрать язык', exact: true }).click();
    await expect(btn('Создать аккаунт')).toBeVisible();
    const guestLink = page.getByRole('link', { name: 'Пройти первый урок без регистрации' });
    await expect(guestLink).toBeVisible();
    await page.screenshot({ path: info.outputPath('entry.png') });
    await guestLink.focus();
    await page.keyboard.press('Enter');
    await btn('Войти в историю').click();
    const token = (await context.cookies()).find((c) => c.name === 'langplot_session')!.value;
    guestId = (
      await db.session.findUniqueOrThrow({
        where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      })
    ).userId;
    const run = await db.playthrough.findFirstOrThrow({ where: { userId: guestId } });
    for (let i = 0; i < 9; i++) await next();
    await page.locator('.lr-options button').nth(0).click();
    await expect(page.getByRole('status')).toContainText('right now');
    await page.reload();
    await expect(page.getByRole('status')).toContainText('right now');
    await page.locator('.lr-options button').nth(1).click();
    await next();
    await option("I'll keep my ticket.");
    for (let i = 0; i < 5; i++) await next();
    for (const term of ['passenger', 'timetable', 'fare', 'ticket office', 'coach', 'subway'])
      await option(term);
    await expect(signUp).toHaveCount(0);
    await expect(btn('Завершить урок')).toBeDisabled();
    await page.getByRole('textbox', { name: 'Сообщение Мэй' }).fill('My ticket says 6:10 PM.');
    await btn('Отправить сообщение').click();
    await btn('Завершить урок').click();
    await expect(signUp).toBeVisible();
    await page.reload();
    await expect(signUp).toBeVisible();
    await expect(page.getByRole('link', { name: 'Следующий урок' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('guest-finish.png') });
    await signUp.click();
    await expect(page.getByRole('heading', { name: 'Сохранить пройденный урок' })).toBeVisible();
    await page.getByLabel('Имя', { exact: true }).fill('Путешественник');
    await page.getByLabel('Электронная почта').fill(email);
    await page.getByLabel('Пароль').fill(randomUUID());
    await btn('Зарегистрироваться').click();
    await expect(page).toHaveURL(/\/courses\/en\/a2$/);
    await expect(
      page.locator('.course-lessons > li').first().getByRole('link', { name: 'Теория урока' }),
    ).toBeVisible();
    await expect(
      page.locator('.course-lessons > li').nth(1).getByRole('link', { name: 'Начать урок' }),
    ).toBeVisible();
    const saved = await db.playthrough.findUniqueOrThrow({
      where: { id: run.id },
      include: { user: true, exchanges: true },
    });
    expect(saved.user.email).toBe(email);
    expect(saved.exchanges).toHaveLength(1);
    expect(saved.state).toMatchObject({ sceneId: 'end', flags: { kept: true } });
    expect(await db.learningAttempt.count({ where: { userId: saved.userId } })).toBeGreaterThan(6);
  } finally {
    if (guestId)
      await db.user.deleteMany({
        where: { id: guestId, OR: [{ email }, { demoKey: { startsWith: 'guest-lesson:' } }] },
      });
    await db.$disconnect();
  }
});
