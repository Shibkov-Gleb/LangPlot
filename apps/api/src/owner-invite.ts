import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from './db.js';
import { config } from './config.js';
try {
  if (await db.user.count({ where: { role: 'SUPERADMIN' } }))
    throw new Error('Главный администратор уже настроен.');
  const token = randomBytes(32).toString('hex');
  const invitation = {
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 24 * 3600000),
  };
  await db.ownerInvite.upsert({
    where: { id: 'initial' },
    create: { id: 'initial', ...invitation },
    update: invitation,
  });
  const dir = new URL('../../../.local/', import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(
    new URL('admin-invite.txt', dir),
    config.WEB_ORIGIN + '/login#owner=' + token + '\n',
    { mode: 0o600 },
  );
  console.log(
    'Ссылка для регистрации главного администратора записана в .local/admin-invite.txt. Действует 24 часа и принимается один раз.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Не удалось создать приглашение.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
