// Optional Windows-only development fallback. Docker Compose remains the default.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32')
  throw new Error('This optional fallback is for Windows. Use pnpm db:up.');
const native = path.join(
  root,
  '.local/postgres/node_modules/@embedded-postgres/windows-x64/native',
);
if (!existsSync(native))
  throw new Error(
    'First run: npm install --prefix .local/postgres @embedded-postgres/windows-x64@17.7.0-beta.16 --ignore-scripts --no-audit --no-fund',
  );
const data = path.join(root, '.local/pgdata-local');
if (!existsSync(path.join(data, 'PG_VERSION'))) {
  mkdirSync(path.join(root, '.local'), { recursive: true });
  const password = path.join(root, '.local/pg-password');
  writeFileSync(password, 'langplot_local');
  execFileSync(
    path.join(native, 'bin/initdb.exe'),
    [
      '-D',
      data,
      '-U',
      'langplot',
      `--pwfile=${password}`,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ],
    { stdio: 'inherit', windowsHide: true },
  );
}
const postgres = spawn(
  path.join(native, 'bin/postgres.exe'),
  ['-D', data, '-h', '127.0.0.1', '-p', '55432'],
  { stdio: 'inherit', windowsHide: true },
);
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const db = new PrismaClient({
  datasourceUrl: 'postgresql://langplot:langplot_local@127.0.0.1:55432/postgres',
});
let stopping = false;
postgres.on('exit', (code) => {
  if (!stopping) process.exit(code ?? 1);
});
function stop() {
  stopping = true;
  try {
    execFileSync(path.join(native, 'bin/pg_ctl.exe'), ['-D', data, '-m', 'fast', 'stop'], {
      stdio: 'inherit',
      windowsHide: true,
    });
  } catch {
    postgres.kill();
  }
  void db.$disconnect();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
let ready = false;
for (let i = 0; i < 40; i++) {
  try {
    await db.$queryRawUnsafe('SELECT 1');
    ready = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!ready) {
  postgres.kill();
  throw new Error('PostgreSQL did not start. Check whether port 55432 is available.');
}
const result = await db.$queryRawUnsafe("SELECT 1 FROM pg_database WHERE datname='langplot'");
if (!result.length) await db.$executeRawUnsafe('CREATE DATABASE langplot');
await db.$disconnect();
console.log('LangPlot PostgreSQL ready at 127.0.0.1:55432. Keep this terminal open.');
