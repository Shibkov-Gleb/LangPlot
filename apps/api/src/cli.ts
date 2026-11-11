import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { validatePackage } from '@langplot/shared';
const [command, file, flag] = process.argv.slice(2);
try {
  if (!file || !['validate', 'import'].includes(command ?? ''))
    throw new Error(
      'Использование: pnpm content validate <file.json> [--publish] | pnpm content import <file.json>',
    );
  if (path.extname(file).toLowerCase() !== '.json')
    throw new Error('Поддерживаются только .json пакеты.');
  if ((await stat(file)).size > 1024 * 1024) throw new Error('Максимальный размер: 1 МБ.');
  const input: unknown = JSON.parse(await readFile(file, 'utf8'));
  const report = validatePackage(input, flag === '--publish' ? 'publish' : 'draft');
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
  else if (command === 'import') {
    const { config } = await import('./config.js');
    const email = process.env.LANGPLOT_ADMIN_EMAIL,
      password = process.env.LANGPLOT_ADMIN_PASSWORD;
    if (!email || !password)
      throw new Error(
        'Для импорта укажите LANGPLOT_ADMIN_EMAIL и LANGPLOT_ADMIN_PASSWORD в окружении.',
      );
    const base = 'http://127.0.0.1:' + config.PORT + '/api';
    const headers = { 'Content-Type': 'application/json', Origin: config.WEB_ORIGIN };
    const login = await fetch(base + '/session/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) throw new Error('Не удалось войти в аккаунт.');
    const cookie = login.headers.getSetCookie()[0]?.split(';')[0];
    if (!cookie) throw new Error('Сессия не создана.');
    try {
      const response = await fetch(base + '/studio/import', {
        method: 'POST',
        headers: { ...headers, Cookie: cookie },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Импорт не выполнен.');
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await fetch(base + '/session', {
        method: 'DELETE',
        headers: { ...headers, Cookie: cookie },
        body: '{}',
      });
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
