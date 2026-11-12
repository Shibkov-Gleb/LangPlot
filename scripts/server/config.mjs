import { access, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { domainToASCII } from 'node:url';
import path from 'node:path';

export const exists = async (file) =>
  access(file).then(
    () => true,
    () => false,
  );
export function domainName(value) {
  if (typeof value !== 'string' || /[\s/:?#@\\]/.test(value))
    throw Error('Укажите домен без https:// и пути.');
  const domain = domainToASCII(value).toLowerCase();
  if (
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)
  )
    throw Error('Некорректный домен. Пример: learn.example.ru');
  return domain;
}
export async function envPath(root) {
  if (process.env.LANGPLOT_ENV_FILE) return path.resolve(root, process.env.LANGPLOT_ENV_FILE);
  return path.join(
    root,
    (await exists(path.join(root, '.env.production'))) ? '.env.production' : '.env',
  );
}
export async function atomicWrite(file, data, mode = 0o600) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.tmp-' + randomBytes(6).toString('hex');
  await writeFile(temporary, data, { mode, flag: 'wx' });
  await rename(temporary, file);
}
export async function patchEnv(file, changes) {
  let text = await readFile(file, 'utf8');
  for (const [key, value] of Object.entries(changes)) {
    if (!/^[A-Z_]+$/.test(key) || /[\r\n]/.test(value))
      throw Error('Некорректное изменение окружения.');
    const line = key + '=' + value;
    const pattern = new RegExp('^' + key + '=.*$', 'm');
    text = pattern.test(text)
      ? text.replace(pattern, () => line)
      : text.trimEnd() + '\n' + line + '\n';
  }
  await atomicWrite(file, text.replaceAll('\r\n', '\n'));
}
export async function initialize(root, supplied) {
  const domain = domainName(supplied),
    file = await envPath(root);
  if (await exists(file)) {
    const old = parseEnv(await readFile(file, 'utf8'));
    if (old.DOMAIN === domain) return file;
    throw Error(
      `Файл ${path.basename(file)} уже существует. Он не перезаписан. Для отдельного окружения задайте LANGPLOT_ENV_FILE.`,
    );
  }
  const template = await readFile(path.join(root, '.env.production.example'), 'utf8');
  const text = template
    .replaceAll('langplot.example.com', domain)
    .replace(
      'POSTGRES_PASSWORD=generate-with-init-script',
      'POSTGRES_PASSWORD=' + randomBytes(32).toString('hex'),
    );
  await writeFile(
    file,
    text + '\nLANGPLOT_ENV=production\nLANGPLOT_PROJECT_NAME=langplot-production\n',
    { flag: 'wx', mode: 0o600 },
  );
  return file;
}
export async function configuration(root, { keyRequired = false } = {}) {
  const file = await envPath(root);
  if (!(await exists(file)))
    throw Error('Сначала выполните ./langplot init ваш-домен.ru и заполните ключ в .env.');
  const raw = parseEnv(await readFile(file, 'utf8'));
  if (!raw.DOMAIN || !raw.WEB_ORIGIN)
    throw Error(
      'Это локальный .env. Для сервера используйте LANGPLOT_ENV_FILE=.env.production ./langplot init ваш-домен.ru',
    );
  const origin = new URL(raw.WEB_ORIGIN);
  if (
    origin.protocol !== 'https:' ||
    origin.hostname !== raw.DOMAIN ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw Error('WEB_ORIGIN должен быть HTTPS-адресом DOMAIN без пути.');
  const project = raw.LANGPLOT_PROJECT_NAME || 'langplot-production';
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project))
    throw Error('Некорректный LANGPLOT_PROJECT_NAME.');
  const user = raw.POSTGRES_USER || 'langplot',
    database = raw.POSTGRES_DB || 'langplot';
  if (![user, database].every((value) => /^[a-z_][a-z0-9_]{0,62}$/.test(value)))
    throw Error('Некорректные имена PostgreSQL.');
  if (
    !raw.POSTGRES_PASSWORD ||
    raw.POSTGRES_PASSWORD === 'generate-with-init-script' ||
    !/^[a-zA-Z0-9_-]+$/.test(raw.POSTGRES_PASSWORD)
  )
    throw Error(
      'Задайте отдельный пароль PostgreSQL из букв, цифр, _ и -. Команда init создаёт его автоматически.',
    );
  if (
    !['local', 'none', 'deepseek'].includes(raw.CHAT_PROVIDER || 'deepseek') ||
    !['local', 'none'].includes(raw.COURSE_PROVIDER || 'local') ||
    !/^deepseek-[a-z0-9.-]+$/.test(raw.DEEPSEEK_MODEL || 'deepseek-flash')
  )
    throw Error('Проверьте CHAT_PROVIDER, COURSE_PROVIDER и DEEPSEEK_MODEL в окружении.');
  if (
    keyRequired &&
    (raw.CHAT_PROVIDER || 'deepseek') === 'deepseek' &&
    !(raw.DEEPSEEK_API_KEY || raw.DEEPSEEK_API)
  )
    throw Error(
      `Добавьте DEEPSEEK_API_KEY в ${path.basename(file)}. Действующие контейнеры не изменены.`,
    );
  const identity = createHash('sha256')
    .update(JSON.stringify([project, user, database, raw.POSTGRES_PASSWORD]))
    .digest('hex');
  return {
    root,
    file,
    raw,
    origin: origin.origin,
    project,
    user,
    database,
    identity,
    stateDir: path.join(root, '.local/server', project),
    backupDir: path.join(root, 'backups'),
  };
}
export function compatibleMigrations(applied, local) {
  for (const migration of applied) {
    const known = Array.isArray(local[migration.name])
      ? local[migration.name]
      : [local[migration.name]];
    if (!known.includes(migration.checksum))
      throw Error(
        'Код не соответствует миграции ' +
          migration.name +
          '. Обновите проект до совместимого выпуска.',
      );
  }
}
