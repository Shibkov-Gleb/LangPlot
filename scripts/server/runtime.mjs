import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';

export function secretText(text, config) {
  let result = String(text);
  for (const [key, value] of Object.entries(config.raw))
    if (/PASSWORD|KEY|TOKEN|SECRET|DEEPSEEK_API$/.test(key) && value)
      result = result.replaceAll(value, '[скрыто]');
  return result;
}
export function processCommand(
  command,
  args,
  config,
  { input, output, capture = false, tag, quiet = false } = {},
) {
  const child = spawn(command, args, {
    cwd: config.root,
    windowsHide: true,
    env: {
      ...process.env,
      ...config.raw,
      DEEPSEEK_API_KEY: config.raw.DEEPSEEK_API_KEY || config.raw.DEEPSEEK_API || '',
      ...(tag ? { APP_TAG: tag } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '',
    bytes = 0;
  child.stderr.on('data', (data) => {
    stderr = (stderr + data).slice(-16000);
    if (!quiet) process.stderr.write(secretText(data, config));
  });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(
            Error(
              secretText(`${command} завершился с кодом ${code}. ${stderr.slice(-1500)}`, config),
            ),
          ),
    );
  });
  let stream;
  if (output)
    stream = pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 }));
  else
    child.stdout.on('data', (data) => {
      if (capture) {
        bytes += data.length;
        if (bytes > 80 * 1024 * 1024) child.kill();
        else stdout += data;
      } else if (!quiet) process.stdout.write(secretText(data, config));
    });
  let sending;
  if (input?.file) sending = pipeline(createReadStream(input.file), child.stdin);
  else {
    child.stdin.on('error', () => {});
    child.stdin.end(input || undefined);
  }
  return Promise.all([done, stream, sending]).then(([result]) => result);
}
export const docker = (config, args, options) => processCommand('docker', args, config, options);
export function composeArgs(config, args) {
  const files = ['-f', path.join(config.root, 'compose.production.yaml')];
  if (process.env.LANGPLOT_COMPOSE_OVERRIDE)
    files.push('-f', path.resolve(config.root, process.env.LANGPLOT_COMPOSE_OVERRIDE));
  return [
    'compose',
    '--project-name',
    config.project,
    '--env-file',
    config.file,
    ...files,
    ...args,
  ];
}
export const compose = (config, args, options) =>
  docker(config, composeArgs(config, args), options);
export async function container(config, service) {
  const { stdout } = await compose(config, ['ps', '-a', '-q', service], {
    capture: true,
    quiet: true,
  });
  if (!stdout.trim()) return null;
  const data = await docker(config, ['inspect', stdout.trim().split('\n')[0]], {
    capture: true,
    quiet: true,
  });
  return JSON.parse(data.stdout)[0];
}
export async function volume(config, name) {
  try {
    return JSON.parse(
      (
        await docker(config, ['volume', 'inspect', `${config.project}_${name}`], {
          capture: true,
          quiet: true,
        })
      ).stdout,
    )[0];
  } catch (error) {
    if (/no such volume|not found/i.test(error.message)) return null;
    throw error;
  }
}
export async function localMigrations(config) {
  const root = path.join(config.root, 'apps/api/prisma/migrations'),
    result = {};
  for (const name of await readdir(root)) {
    if (name === 'migration_lock.toml') continue;
    const source = await readFile(path.join(root, name, 'migration.sql'), 'utf8');
    const lf = source.replaceAll('\r\n', '\n');
    result[name] = [
      ...new Set(
        [source, lf, lf.replaceAll('\n', '\r\n')].map((text) =>
          createHash('sha256').update(text).digest('hex'),
        ),
      ),
    ];
  }
  return result;
}
export async function sql(config, statement) {
  const { stdout } = await compose(
    config,
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'exec psql -U "$POSTGRES_USER" -d "$1" -tAX -v ON_ERROR_STOP=1 -c "$2"',
      'sh',
      config.database,
      statement,
    ],
    { capture: true, quiet: true },
  );
  return stdout.trim();
}
export async function databaseInfo(config) {
  const has = await sql(config, "SELECT to_regclass('public._prisma_migrations') IS NOT NULL");
  const migrations =
    has === 't'
      ? JSON.parse(
          await sql(
            config,
            `SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum) ORDER BY migration_name),'[]') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
          ),
        )
      : [];
  const failed =
    has === 't'
      ? Number(
          await sql(
            config,
            'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL',
          ),
        )
      : 0;
  if (failed)
    throw Error(
      'В базе есть незавершённая миграция. Сайт оставлен в режиме обслуживания; проверьте предыдущую операцию.',
    );
  const tables = JSON.parse(
    await sql(
      config,
      "SELECT coalesce(json_agg(tablename),'[]') FROM pg_tables WHERE schemaname='public'",
    ),
  );
  if (tables.length > 100) throw Error('Неожиданный размер схемы базы.');
  const counts = tables.length
    ? JSON.parse(
        await sql(
          config,
          'SELECT json_build_object(' +
            tables
              .map((name) => {
                const identifier = '"' + name.replaceAll('"', '""') + '"';
                return (
                  "'" + name.replaceAll("'", "''") + "', (SELECT count(*) FROM " + identifier + ')'
                );
              })
              .join(',') +
            ')',
        ),
      )
    : {};
  return { migrations, counts };
}
export async function maintenance(config, enabled) {
  const caddy = await container(config, 'caddy');
  if (!caddy?.State.Running) return false;
  const content = enabled
    ? '{$DOMAIN} {\n header Retry-After "120"\n respond "LangPlot: идёт обновление. Скоро вернёмся." 503\n}\n'
    : await readFile(path.join(config.root, 'deploy/Caddyfile'), 'utf8');
  await compose(
    config,
    [
      'exec',
      '-T',
      'caddy',
      'sh',
      '-ec',
      'cat > /config/langplot-active.caddy.tmp; caddy validate --config /config/langplot-active.caddy.tmp --adapter caddyfile; ' +
        (enabled ? 'touch /config/langplot-maintenance; ' : '') +
        'mv /config/langplot-active.caddy.tmp /config/langplot-active.caddy; caddy reload --config /config/langplot-active.caddy --adapter caddyfile' +
        (enabled ? '' : '; rm -f /config/langplot-maintenance'),
    ],
    { input: content, quiet: true },
  );
  return true;
}
