import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  initialize,
  configuration,
  envPath,
  patchEnv,
  domainName,
  compatibleMigrations,
} from '../../scripts/server/config.mjs';
import { localMigrations, secretText, processCommand } from '../../scripts/server/runtime.mjs';
import {
  validateManifest,
  checksum,
  unpack,
  removeWorkspace,
} from '../../scripts/server/archive.mjs';

const local = path.resolve('.local');
await mkdir(local, { recursive: true });
const base = await mkdtemp(path.join(local, 'ops-unit-'));
const previousEnv = process.env.LANGPLOT_ENV_FILE;
delete process.env.LANGPLOT_ENV_FILE;
after(async () => {
  if (previousEnv === undefined) delete process.env.LANGPLOT_ENV_FILE;
  else process.env.LANGPLOT_ENV_FILE = previousEnv;
  const relative = path.relative(local, base);
  if (relative.startsWith('ops-unit-') && !relative.includes(path.sep))
    await rm(base, { recursive: true, force: true });
});
async function fixture(name) {
  const root = path.join(base, name);
  await mkdir(root);
  await writeFile(
    path.join(root, '.env.production.example'),
    await readFile('.env.production.example'),
  );
  return root;
}
test('normalizes Russian and uppercase domains, rejects paths, IPs and invalid labels', () => {
  assert.equal(domainName('LEARN.Example.RU'), 'learn.example.ru');
  assert.match(domainName('пример.рф'), /^xn--/);
  for (const name of [
    'https://a.ru',
    'a.ru/path',
    'a.ru\nKEY=x',
    '127.0.0.1',
    '-bad.ru',
    'a..ru',
    'a.ru:443',
    'a.ru@evil.ru',
  ])
    assert.throws(() => domainName(name));
});
test('init is idempotent and never overwrites an existing local environment', async () => {
  const root = await fixture('init');
  const file = await initialize(root, 'learn.example.ru');
  const original = await readFile(file, 'utf8'),
    data = parseEnv(original);
  assert.match(data.POSTGRES_PASSWORD, /^[a-f0-9]{64}$/);
  assert.equal(data.WEB_ORIGIN, 'https://learn.example.ru');
  await initialize(root, 'learn.example.ru');
  assert.equal(await readFile(file, 'utf8'), original);
  await assert.rejects(initialize(root, 'other.example.ru'));
  const dev = await fixture('dev');
  await writeFile(path.join(dev, '.env'), 'DEEPSEEK_API_KEY=private-local-key\n');
  await assert.rejects(initialize(dev, 'learn.example.ru'));
  assert.equal(
    await readFile(path.join(dev, '.env'), 'utf8'),
    'DEEPSEEK_API_KEY=private-local-key\n',
  );
});
test('detects legacy production environments without reading the development file', async () => {
  const root = await fixture('legacy');
  await writeFile(path.join(root, '.env'), 'DATABASE_URL=local');
  await writeFile(path.join(root, '.env.production'), 'DOMAIN=legacy.example.ru');
  assert.equal(await envPath(root), path.join(root, '.env.production'));
});
test('requires a provider key before deployment, permits offline maintenance and rejects invalid origins', async () => {
  const root = await fixture('config');
  const file = await initialize(root, 'learn.example.ru');
  await assert.rejects(configuration(root, { keyRequired: true }), /DEEPSEEK_API_KEY/);
  assert.equal((await configuration(root)).project, 'langplot-production');
  await patchEnv(file, { DEEPSEEK_API_KEY: 'test-secret', APP_TAG: 'release-1' });
  assert.equal((await configuration(root, { keyRequired: true })).raw.APP_TAG, 'release-1');
  await patchEnv(file, { WEB_ORIGIN: 'https://evil.example.ru' });
  await assert.rejects(configuration(root), /WEB_ORIGIN/);
});
test('release updates preserve the database password and operator-provided keys literally', async () => {
  const root = await fixture('patch'),
    file = await initialize(root, 'learn.example.ru');
  const password = parseEnv(await readFile(file, 'utf8')).POSTGRES_PASSWORD;
  await writeFile(
    file,
    (await readFile(file, 'utf8')) + '\n# operator notes\nDEEPSEEK_API="a-$()-`literal`"\n',
  );
  await patchEnv(file, { APP_TAG: 'release-2' });
  const text = await readFile(file, 'utf8'),
    updated = parseEnv(text);
  assert.equal(updated.POSTGRES_PASSWORD, password);
  assert.equal(updated.DEEPSEEK_API, 'a-$()-`literal`');
  assert.match(text, /# operator notes/);
  assert.equal(updated.APP_TAG, 'release-2');
  await assert.rejects(patchEnv(file, { APP_TAG: 'bad\nDATABASE=x' }));
});
test('migration compatibility accepts line-ending differences and refuses changed SQL or newer schemas', async () => {
  const root = await fixture('migrations'),
    dir = path.join(root, 'apps/api/prisma/migrations/001_initial');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'migration.sql'), 'CREATE TABLE one(id INT);\n');
  const local = await localMigrations({ root });
  const crlf = createHash('sha256').update('CREATE TABLE one(id INT);\r\n').digest('hex');
  compatibleMigrations([{ name: '001_initial', checksum: crlf }], local);
  assert.throws(() =>
    compatibleMigrations([{ name: '001_initial', checksum: 'a'.repeat(64) }], local),
  );
  assert.throws(() => compatibleMigrations([{ name: '002_future', checksum: crlf }], local));
});
test('backup manifest rejects extra files and unsupported versions', () => {
  const manifest = {
    format: 'langplot-backup',
    version: 1,
    postgresMajor: 17,
    migrations: [],
    counts: { User: 2 },
    files: ['database.dump', 'persistent-files.json'].map((name) => ({
      name,
      bytes: 1,
      sha256: 'a'.repeat(64),
    })),
  };
  validateManifest(manifest);
  assert.throws(() => validateManifest({ ...manifest, version: 2 }));
  assert.throws(() => validateManifest({ ...manifest, counts: { User: -1 } }));
  assert.throws(() =>
    validateManifest({
      ...manifest,
      files: [manifest.files[0], { ...manifest.files[1], name: '../evil' }],
    }),
  );
});
test('validates the full archive before returning a database payload; detects corruption', async () => {
  const root = await fixture('archive'),
    backupDir = path.join(root, 'backups'),
    source = path.join(root, 'source');
  await mkdir(source);
  const config = { root, backupDir, raw: {} };
  await writeFile(path.join(source, 'database.dump'), 'PGDMPtest-database');
  await writeFile(
    path.join(source, 'persistent-files.json'),
    '{"version":1,"directories":[],"files":[]}',
  );
  const manifest = {
    format: 'langplot-backup',
    version: 1,
    postgresMajor: 17,
    migrations: [],
    counts: null,
    files: [],
  };
  for (const name of ['database.dump', 'persistent-files.json'])
    manifest.files.push({
      name,
      bytes: (await readFile(path.join(source, name))).length,
      sha256: await checksum(path.join(source, name)),
    });
  await writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest));
  const archive = path.join(root, 'good.tar.gz');
  await processCommand(
    'tar',
    ['-czf', archive, '-C', source, 'manifest.json', 'database.dump', 'persistent-files.json'],
    config,
    { quiet: true },
  );
  const unpacked = await unpack(config, archive);
  assert.equal(
    await readFile(path.join(unpacked.dir, 'database.dump'), 'utf8'),
    'PGDMPtest-database',
  );
  await removeWorkspace(config, unpacked.dir);
  await writeFile(path.join(source, 'database.dump'), 'PGDMPtampered-data');
  const bad = path.join(root, 'bad.tar.gz');
  await processCommand(
    'tar',
    ['-czf', bad, '-C', source, 'manifest.json', 'database.dump', 'persistent-files.json'],
    config,
    { quiet: true },
  );
  await assert.rejects(unpack(config, bad), /Повреждён/);
  assert.deepEqual(await readdir(backupDir), []);
});
test('persistent file restore rejects traversal before writing anything', async () => {
  const root = await fixture('paths'),
    target = path.join(root, 'data');
  await mkdir(target);
  const helper = await readFile('deploy/persistent-files.mjs', 'utf8');
  const bytes = Buffer.from('private');
  const input = JSON.stringify({
    version: 1,
    directories: [],
    files: [
      {
        path: '../outside',
        mode: 0o600,
        base64: bytes.toString('base64'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  });
  assert.throws(() =>
    execFileSync(process.execPath, ['--input-type=module', '-e', helper, 'restore'], {
      input,
      env: { ...process.env, LANGPLOT_FILE_ROOT: target },
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );
  assert.deepEqual(await readdir(target), []);
});
test('diagnostics redact configured credentials', () => {
  assert.equal(
    secretText('key abcdef, password 123456, alias secret', {
      raw: { DEEPSEEK_API_KEY: 'abcdef', POSTGRES_PASSWORD: '123456', DEEPSEEK_API: 'secret' },
    }),
    'key [скрыто], password [скрыто], alias [скрыто]',
  );
});
