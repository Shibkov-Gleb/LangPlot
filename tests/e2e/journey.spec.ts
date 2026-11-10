import { test, expect } from '@playwright/test';
test('landing, persistent profile, player phone and local studio', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    // Kaspersky on this workstation injects its own script into every page.
    // Keep it enabled; exclude only that independently injected host from the app audit.
    if (host === 'me.kis.v2.scr.kaspersky-labs.com') return;
    if (!host.match(/^(localhost|127\.0\.0\.1)$/)) external.push(host);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ещё одна глава');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'К содержимому' })).toBeFocused();
  for (const element of await page.locator('[data-reveal]').all())
    await element.scrollIntoViewIfNeeded();
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await page.getByRole('heading', { level: 1 }).click();
  await page.screenshot({ path: testInfo.outputPath('hero.png') });
  await page.screenshot({ path: testInfo.outputPath('landing.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('link', { name: 'Выбрать язык', exact: true }).click();
  await page.getByRole('button', { name: 'Войти в демо-профиль' }).click();
  await expect(page.getByRole('heading', { name: 'Ваши языковые миры.' })).toBeVisible();
  await page.getByRole('button', { name: /DE Немецкий/ }).click();
  await expect(page.getByRole('button', { name: /DE Немецкий/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'B1 Больше самостоятельности' }).click();
  await expect(page).toHaveURL(/\/courses\/de\/b1$/);
  await expect(page.getByRole('heading', { name: 'Уроки готовятся' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Уроки готовятся' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Мои миры', exact: true }).click();
  await expect(page.getByRole('button', { name: 'B1 Больше самостоятельности' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('textbox', { name: 'Как к вам обращаться' }).fill('Исследователь');
  await page.getByRole('checkbox', { name: /Меньше анимации/ }).check();
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(page.getByRole('status')).toHaveText('Настройки сохранены.');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Меньше анимации/ })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await page.getByRole('link', { name: 'Мои миры', exact: true }).click();
  await page.getByRole('link', { name: /Заглянуть за кулисы/ }).click();
  await expect(page.getByText('LANGPLOT / ПРОВЕРКА МЕХАНИК')).toBeVisible();
  if (await page.getByRole('button', { name: /Осмотреть пространство/ }).isVisible())
    await page.getByRole('button', { name: /Осмотреть пространство/ }).click();
  await page.reload();
  await expect(page.getByText(/Выбор сохранён|Техническая проверка завершена/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('player.png'), fullPage: true });
  await page.getByRole('button', { name: 'Открыть телефон' }).click();
  await expect(page.getByRole('dialog', { name: 'Телефон' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Hallo');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(
    page.getByText('Hallo! Deine Nachricht ist angekommen. Dies ist ein technischer Test.').last(),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('/error');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByText('Ответ не получен').last()).toBeVisible();
  await page.getByRole('button', { name: 'Повторить', exact: true }).last().click();
  await expect(page.getByText('Ответ не получен')).toHaveCount(0);
  await expect(page.locator('.message-exchange').last().locator('.incoming')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/studio');
  await page
    .getByRole('textbox', { name: 'Что нужно подготовить?' })
    .fill(`Технический черновик ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole('button', { name: 'Подготовить черновик' }).click();
  await expect(page.getByText('Формат пакета корректен').first()).toBeVisible();
  await expect(page.getByText('Статус: черновик, не готов к публикации.').first()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Скачать пакет JSON' }).click();
  const download = await downloadPromise;
  const destination = testInfo.outputPath('draft.json');
  await download.saveAs(destination);
  await page.getByLabel('Выбрать пакет JSON').setInputFiles(destination);
  await expect(page.getByRole('button', { name: 'Импортировать как черновик' })).toBeEnabled();
  await page.getByRole('button', { name: 'Импортировать как черновик' }).click();
  await expect(page.getByRole('status')).toContainText('Черновик импортирован');
  await page.screenshot({ path: testInfo.outputPath('studio.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ещё одна глава');
});
test('returns to the requested course after signing in', async ({ page }) => {
  await page.goto('/courses/en/a2');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole('button', { name: 'Войти в демо-профиль' }).click();
  await expect(page).toHaveURL(/\/courses\/en\/a2$/);
  await expect(page.getByRole('heading', { name: 'Последняя перекличка' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Мои миры', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A2 Простые разговоры' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
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
  expect(await page.locator('.will-reveal').count()).toBe(0);
});
