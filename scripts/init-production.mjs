import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
import path from 'node:path';
try {
  const supplied = process.argv[2] ?? '';
  const domain = new URL('https://' + supplied).hostname;
  if (supplied !== domain || isIP(domain) || !/^[a-z0-9.-]+\.[a-z]{2,63}$/.test(domain))
    throw Error(
      'Укажите домен без схемы и пути, например node scripts/init-production.mjs langplot.ru',
    );
  let tag = 'local';
  try {
    tag = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {}
  const example = await readFile(new URL('../.env.production.example', import.meta.url), 'utf8');
  const env = example
    .replace('DOMAIN=langplot.example.com', 'DOMAIN=' + domain)
    .replace('WEB_ORIGIN=https://langplot.example.com', 'WEB_ORIGIN=https://' + domain)
    .replace('APP_TAG=latest', 'APP_TAG=' + tag)
    .replace(
      'POSTGRES_PASSWORD=generate-with-init-script',
      'POSTGRES_PASSWORD=' + randomBytes(32).toString('hex'),
    );
  await writeFile(path.resolve('.env.production'), env, { flag: 'wx', mode: 0o600 });
  console.log(
    'Создан .env.production с отдельным паролем PostgreSQL. Заполните DEEPSEEK_API_KEY перед запуском.',
  );
} catch (error) {
  console.error(error?.code === 'EEXIST' ? '.env.production уже существует.' : error.message);
  process.exitCode = 1;
}
