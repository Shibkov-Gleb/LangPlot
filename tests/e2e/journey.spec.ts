import { test, expect } from '@playwright/test';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { randomUUID } from 'node:crypto';
test('ученик выбирает курс, активирует подписку и работает с CRM только после назначения', async ({
  page,
}, info) => {
  test.setTimeout(110000);
  process.loadEnvFile('.env');
  const db = new PrismaClient(),
    email = randomUUID() + '@playwright.invalid',
    password = randomUUID();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ещё одна глава');
    await page.screenshot({ path: info.outputPath('cover.png') });
    await page.getByRole('link', { name: 'Выбрать язык', exact: true }).click();
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await page.getByLabel('Имя', { exact: true }).fill('Ученик CRM');
    await page.getByLabel('Электронная почта').fill(email);
    await page.getByLabel('Пароль', { exact: false }).fill(password);
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(page.getByRole('heading', { name: 'Ваши языковые миры.' })).toBeVisible();
    await expect(page.locator('.levels .level-live')).toHaveText(/A2.*Доступен/);
    await expect(page.locator('.levels .in-development')).toHaveCount(5);
    await page.screenshot({ path: info.outputPath('catalog.png') });
    await page.getByRole('button', { name: /DE Немецкий/ }).click();
    await expect(page.locator('.levels .in-development')).toHaveCount(6);
    await expect(page.getByRole('link', { name: 'Открыть курс' })).toHaveCount(0);
    await page.getByRole('button', { name: /EN Английский/ }).click();
    await page.getByRole('link', { name: 'Открыть курс' }).click();
    await expect(page.getByRole('heading', { name: 'Последняя перекличка' })).toBeVisible();
    await page.goto('/dashboard/settings');
    await page.getByRole('button', { name: 'Активировать тестовую подписку' }).click();
    await expect(page.getByRole('status')).toContainText('активирована');
    await page.reload();
    await expect(page.locator('.subscription-panel strong')).toHaveText('С подпиской');
    for (const path of ['/admin', '/studio']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Доступ ограничен' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.goto('/courses/en/a2');
    await page.getByLabel('Электронная почта').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Последняя перекличка' })).toBeVisible();
    await db.user.update({ where: { email }, data: { role: 'ADMIN' } });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Администрирование' })).toBeVisible();
    await expect(page.getByText('Данные об оплатах ещё не собираются').first()).toBeVisible();
    await page.getByRole('button', { name: 'CSV по когортам' }).click();
    await expect(page.getByRole('dialog')).toContainText('Столбцы');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Скачать CSV' }).click();
    expect((await download).suggestedFilename()).toContain('cohorts');
    await page.getByRole('link', { name: 'Уроки', exact: true }).click();
    await expect(page.getByRole('heading', { name: /движение по курсу/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /действия по сценам/ })).toBeAttached();
    await page.getByRole('link', { name: 'Ученики', exact: true }).click();
    await page.getByLabel('Поиск по имени или почте').fill(email);
    await page.getByRole('link', { name: new RegExp(email.replaceAll('.', '\\.')) }).click();
    await expect(page.getByRole('button', { name: 'Назначить администратором' })).toHaveCount(0);
    await page.getByLabel('Внутренняя заметка').fill('Разобрали первый урок.');
    await page.getByRole('button', { name: 'Добавить заметку' }).click();
    await expect(page.locator('.crm-timeline')).toContainText('Разобрали первый урок.');
    await page.getByLabel('Статус контакта').selectOption('FOLLOW_UP');
    await page.getByLabel('Следующий контакт').fill('2026-01-18');
    await page.getByRole('button', { name: 'Сохранить контакт' }).click();
    await expect(page.getByRole('status')).toHaveText('Контакт сохранён.');
    await page.getByRole('link', { name: 'К списку аккаунтов' }).click();
    await expect(page.getByLabel('Поиск по имени или почте')).toHaveValue(email);
    await page.getByLabel('Уровень доступа').selectOption('ADMIN');
    await page.getByRole('button', { name: 'На сегодня' }).click();
    await expect(page.getByRole('link', { name: new RegExp(email) })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('crm.png') });
    await page.getByRole('link', { name: 'Студия контента' }).click();
    await expect(page.getByRole('heading', { name: /Студия контента/ })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await db.crmEvent.deleteMany({ where: { authorId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  }
});
test('reduced motion and keyboard navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'К содержимому' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeInViewport();
  expect(await page.locator('.hero-art').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none',
  );
});
