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
    const { localMode } = await import('./config.js');
    if (!localMode)
      throw new Error('Импорт доступен только при LOCAL_DEMO_MODE=true вне production.');
    const { importPackage } = await import('./content-service.js');
    const { db } = await import('./db.js');
    try {
      console.log(JSON.stringify(await importPackage(input), null, 2));
    } finally {
      await db.$disconnect();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
