import { expect, test } from '@playwright/test';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createHash } from 'node:crypto';

declare global {
  interface Window {
    speechClips: HTMLAudioElement[];
  }
}
test('озвучка играет локально, повторяется, выключается и восстанавливается в сохранении', async ({
  page,
  context,
}, info) => {
  process.loadEnvFile('.env');
  const db = new PrismaClient();
  let guestId: string | undefined;
  await page.addInitScript(() => {
    window.speechClips = [];
    const OriginalAudio = window.Audio;
    window.Audio = class extends OriginalAudio {
      constructor(src?: string) {
        super(src);
        if (src?.includes('/assets/voices/')) window.speechClips.push(this);
      }
    };
  });
  try {
    await page.goto('/guest/last-row');
    const response = page.waitForResponse(
      (r) => r.url().includes('/assets/voices/') && [200, 206].includes(r.status()),
    );
    await page.getByRole('button', { name: 'Войти в историю', exact: true }).click();
    const token = (await context.cookies()).find((c) => c.name === 'langplot_session')!.value;
    guestId = (
      await db.session.findUniqueOrThrow({
        where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      })
    ).userId;
    await response;
    await expect
      .poll(() => page.evaluate(() => window.speechClips.at(-1)?.currentTime ?? 0))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole('button', { name: 'Повторить реплику', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
    expect(await page.evaluate(() => window.speechClips.every((clip) => clip.paused))).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Повторить реплику', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Включить звук', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.speechClips.at(-1)?.paused)).toBe(false);
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await expect(page.locator('.lr-speech')).toContainText('Mine are in my bag');
    expect(
      await page.evaluate(() => window.speechClips.slice(0, -1).every((clip) => clip.paused)),
    ).toBe(true);
    await page.reload();
    await expect(page.locator('.lr-speech')).toContainText('Mine are in my bag');
    await page.getByRole('button', { name: 'Повторить реплику', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.speechClips.at(-1)?.currentTime ?? 0))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('voiceover.png') });
  } finally {
    if (guestId)
      await db.user.deleteMany({
        where: { id: guestId, demoKey: { startsWith: 'guest-lesson:' } },
      });
    await db.$disconnect();
  }
});
