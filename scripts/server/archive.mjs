import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm, stat, open, chmod } from 'node:fs/promises';
import path from 'node:path';
import { docker, compose, processCommand, volume, databaseInfo } from './runtime.mjs';

export const nodeImage = 'node:22-bookworm-slim';
const entries = ['manifest.json', 'database.dump', 'persistent-files.json'];
export async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function workspace(config) {
  await mkdir(config.backupDir, { recursive: true, mode: 0o700 });
  const dir = path.join(config.backupDir, '.work-' + randomBytes(12).toString('hex'));
  await mkdir(dir, { mode: 0o700 });
  return dir;
}
export async function removeWorkspace(config, dir) {
  const relative = path.relative(config.backupDir, dir);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !path.basename(dir).startsWith('.work-')
  )
    throw Error('Небезопасный путь временной папки.');
  await rm(dir, { recursive: true, force: true });
}
export async function appFiles(config, action, { output, input } = {}) {
  const program = await readFile(path.join(config.root, 'deploy/persistent-files.mjs'), 'utf8');
  return docker(
    config,
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'none',
      '--read-only',
      '--mount',
      `type=volume,source=${config.project}_api-data,target=/data${action === 'export' ? ',readonly' : ''}`,
      nodeImage,
      'node',
      '--input-type=module',
      '-e',
      program,
      action,
    ],
    { output, input, quiet: true },
  );
}
export async function backup(
  config,
  { quiesced = false, tag = config.raw.APP_TAG || 'latest' } = {},
) {
  if (!(await volume(config, 'postgres-data')))
    throw Error('Том базы не найден. Пустая копия не будет создана.');
  const dir = await workspace(config);
  const name = `langplot-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.tar.gz`;
  const temporary = path.join(config.backupDir, name + '.tmp');
  try {
    const info = await databaseInfo(config);
    await compose(
      config,
      [
        'exec',
        '-T',
        'postgres',
        'sh',
        '-c',
        'exec pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom',
        'sh',
        config.database,
      ],
      { output: path.join(dir, 'database.dump'), quiet: true },
    );
    if (await volume(config, 'api-data'))
      await appFiles(config, 'export', { output: path.join(dir, 'persistent-files.json') });
    else
      await writeFile(
        path.join(dir, 'persistent-files.json'),
        JSON.stringify({ version: 1, files: [], directories: [] }),
        { mode: 0o600 },
      );
    const manifest = {
      format: 'langplot-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      project: config.project,
      domain: config.raw.DOMAIN,
      origin: config.origin,
      appTag: tag,
      commit: process.env.LANGPLOT_COMMIT || 'unknown',
      postgresMajor: 17,
      quiesced,
      counts: quiesced ? info.counts : null,
      migrations: info.migrations,
      files: await Promise.all(
        entries.slice(1).map(async (name) => ({
          name,
          bytes: (await stat(path.join(dir, name))).size,
          sha256: await checksum(path.join(dir, name)),
        })),
      ),
    };
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    await processCommand('tar', ['-czf', temporary, '-C', dir, ...entries], config, {
      quiet: true,
    });
    const target = path.join(config.backupDir, name);
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    console.log('Архив: ' + target);
    return target;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await removeWorkspace(config, dir);
  }
}
export function validateManifest(manifest) {
  if (
    manifest?.format !== 'langplot-backup' ||
    manifest.version !== 1 ||
    manifest.postgresMajor !== 17 ||
    !Array.isArray(manifest.migrations) ||
    !Array.isArray(manifest.files)
  )
    throw Error('Формат или версия PostgreSQL архива не поддерживаются.');
  if (
    manifest.files.length !== 2 ||
    new Set(manifest.files.map((file) => file.name)).size !== 2 ||
    manifest.files.some(
      (file) =>
        !entries.slice(1).includes(file.name) ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0,
    )
  )
    throw Error('Некорректный манифест файлов архива.');
  for (const migration of manifest.migrations)
    if (!/^[a-zA-Z0-9_]+$/.test(migration.name) || !/^[a-f0-9]{64}$/.test(migration.checksum))
      throw Error('Некорректный список миграций архива.');
  if (
    manifest.counts !== null &&
    (typeof manifest.counts !== 'object' ||
      Array.isArray(manifest.counts) ||
      Object.values(manifest.counts).some((count) => !Number.isSafeInteger(count) || count < 0))
  )
    throw Error('Некорректные счётчики архива.');
}
export async function unpack(config, supplied) {
  const archive = path.resolve(config.root, supplied);
  const list = (
    await processCommand('tar', ['-tzf', archive], config, { capture: true, quiet: true })
  ).stdout
    .trim()
    .split(/\r?\n/);
  if (
    list.length !== entries.length ||
    new Set(list).size !== entries.length ||
    list.some((name) => !entries.includes(name))
  )
    throw Error('В архиве найдены неизвестные или повторяющиеся пути.');
  const manifest = JSON.parse(
    (
      await processCommand('tar', ['-xOf', archive, 'manifest.json'], config, {
        capture: true,
        quiet: true,
      })
    ).stdout,
  );
  validateManifest(manifest);
  const dir = await workspace(config);
  try {
    for (const file of manifest.files) {
      const target = path.join(dir, file.name);
      await processCommand('tar', ['-xOf', archive, file.name], config, {
        output: target,
        quiet: true,
      });
      if ((await stat(target)).size !== file.bytes || (await checksum(target)) !== file.sha256)
        throw Error('Повреждён архив: ' + file.name);
    }
    const handle = await open(path.join(dir, 'database.dump'), 'r');
    try {
      const header = Buffer.alloc(5);
      await handle.read(header);
      if (header.toString() !== 'PGDMP') throw Error('Неизвестный формат дампа.');
    } finally {
      await handle.close();
    }
    return { dir, manifest, archive };
  } catch (error) {
    await removeWorkspace(config, dir);
    throw error;
  }
}
