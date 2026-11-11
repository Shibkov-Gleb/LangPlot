import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { compose } from './production-compose.mjs';

try {
  const source = process.argv[2],
    database = process.argv[3];
  if (!source || !/^langplot_restore_[a-z0-9_]{1,40}$/.test(database || ''))
    throw Error(
      'Использование: node scripts/restore-production.mjs backup.dump langplot_restore_YYYYMMDD',
    );
  const file = path.resolve(source);
  await access(file);
  // createdb refuses an existing database; a restore never overwrites the active one.
  const create = await compose([
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'exec createdb -U "$POSTGRES_USER" --template=template0 "$1"',
    'sh',
    database,
  ]);
  await create.done;
  const { child, done } = await compose(
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'exec pg_restore -U "$POSTGRES_USER" --dbname="$1" --no-owner --no-acl --exit-on-error',
      'sh',
      database,
    ],
    ['pipe', 'inherit', 'inherit'],
  );
  await Promise.all([pipeline(createReadStream(file), child.stdin), done]);
  console.log('Копия восстановлена в отдельную базу ' + database + '. Рабочая база не изменена.');
} catch (error) {
  console.error('Восстановление не завершено: ' + error.message);
  process.exitCode = 1;
}
