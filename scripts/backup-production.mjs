import { mkdir, open, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { compose, root } from './production-compose.mjs';

// pg_dump streams binary bytes directly; this also avoids PowerShell text redirection.
const dir = path.resolve(root, process.argv[2] || 'backups');
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const target = path.join(dir, `langplot-${stamp}-${randomBytes(6).toString('hex')}.dump`);
const temporary = target + '.tmp';
let file;
try {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  file = await open(temporary, 'wx', 0o600);
  const { child, done } = await compose(
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom',
    ],
    ['ignore', 'pipe', 'inherit'],
  );
  await Promise.all([pipeline(child.stdout, file.createWriteStream()), done]);
  await rename(temporary, target);
  console.log('Резервная копия PostgreSQL: ' + target);
} catch (error) {
  await file?.close().catch(() => {});
  // Remove only the uniquely named temporary file owned by this invocation.
  if (file) await rm(temporary, { force: true });
  console.error('Резервная копия не создана: ' + error.message);
  process.exitCode = 1;
}
