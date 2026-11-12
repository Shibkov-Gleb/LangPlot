import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  initialize,
  configuration,
  atomicWrite,
  patchEnv,
  exists,
  compatibleMigrations,
} from './server/config.mjs';
import {
  docker,
  compose,
  container,
  volume,
  localMigrations,
  databaseInfo,
  maintenance,
  secretText,
} from './server/runtime.mjs';
import { backup, unpack, appFiles, removeWorkspace } from './server/archive.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.argv[2] || 'status';
let config,
  state = {},
  stateFile;
let tracking = false;
const save = () => atomicWrite(stateFile, JSON.stringify(state, null, 2) + '\n');
async function stage(name) {
  state.operation.stage = name;
  await save();
  console.log('→ ' + name);
}
async function start(tag) {
  await compose(
    config,
    ['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '150', 'caddy'],
    { tag },
  );
  await maintenance(config, true);
  for (const service of ['api', 'web'])
    await compose(
      config,
      ['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '150', service],
      { tag },
    );
  await compose(
    config,
    [
      'exec',
      '-T',
      'api',
      'node',
      '-e',
      "fetch('http://127.0.0.1:4000/api/health').then(async r=>{const j=await r.json();if(!r.ok||!j.ok||j.localMode)process.exit(1)}).catch(()=>process.exit(1))",
    ],
    { tag, quiet: true },
  );
}
async function stopWriters() {
  await maintenance(config, true);
  await compose(config, ['stop', 'api', 'web']);
}
async function identity() {
  const binding = path.join(
    root,
    '.local/server',
    'environment-' +
      (await import('node:crypto'))
        .createHash('sha256')
        .update(path.relative(root, config.file))
        .digest('hex')
        .slice(0, 16) +
      '.json',
  );
  if (await exists(binding)) {
    const previous = JSON.parse(await readFile(binding, 'utf8'));
    if (previous.project !== config.project || previous.identity !== config.identity)
      throw Error(
        'Изменены имя проекта или реквизиты существующего окружения. Данные не переключены. Верните прежние значения.',
      );
  }
  if (state.identity && state.identity !== config.identity)
    throw Error(
      'Изменены имя проекта или реквизиты базы. Верните прежние значения в .env; обновление не меняет базу автоматически.',
    );
  const api = await container(config, 'api');
  const value = api?.Config.Env.find((value) => value.startsWith('DATABASE_URL='));
  if (value) {
    const url = new URL(value.slice('DATABASE_URL='.length));
    if (
      decodeURIComponent(url.username) !== config.user ||
      decodeURIComponent(url.password) !== config.raw.POSTGRES_PASSWORD ||
      url.pathname.slice(1) !== config.database
    )
      throw Error(
        'Реквизиты базы в .env отличаются от действующего приложения. Восстановите прежние значения.',
      );
  }
  await atomicWrite(
    binding,
    JSON.stringify({ project: config.project, identity: config.identity }),
  );
}
async function currentTag() {
  const api = await container(config, 'api');
  return (
    api?.Config.Image.match(/^langplot-api:(.+)$/)?.[1] ||
    state.current?.tag ||
    config.raw.APP_TAG ||
    'latest'
  );
}
async function migrate(tag) {
  await compose(config, ['run', '--rm', '--no-deps', 'migrate'], { tag });
}
async function deploy() {
  if (state.mode === 'transfer')
    throw Error(
      'Запись остановлена для переноса. Для отмены переноса используйте ./langplot resume.',
    );
  await identity();
  const oldTag = await currentTag(),
    existing = !!(await volume(config, 'postgres-data'));
  const commit = process.env.LANGPLOT_COMMIT || 'unknown';
  const tag =
    'release-' +
    new Date().toISOString().replace(/[^0-9]/g, '') +
    '-' +
    randomBytes(4).toString('hex');
  tracking = true;
  state.operation = {
    command,
    stage: 'preflight',
    startedAt: new Date().toISOString(),
    previousTag: oldTag,
    tag,
    commit,
  };
  await stage('Сборка образов при работающем сайте');
  await compose(config, ['build', 'api', 'web'], { tag });
  await compose(config, ['up', '-d', '--no-deps', '--wait', 'postgres'], { tag });
  compatibleMigrations((await databaseInfo(config)).migrations, await localMigrations(config));
  if (existing) {
    await stage('Режим обслуживания и завершение текущих запросов');
    state.mode = 'maintenance';
    await save();
    await stopWriters();
    await stage('Резервная копия перед миграциями');
    state.operation.backup = await backup(config, { quiesced: true, tag: oldTag });
    await save();
  }
  state.mode = 'maintenance';
  await save();
  await stage('Применение миграций');
  await migrate(tag);
  await stage('Запуск и проверка готовности');
  await start(tag);
  // Keep maintenance persistent until both the env and release journal have been written.
  await patchEnv(config.file, { APP_TAG: tag });
  state.previous = state.current || { tag: oldTag };
  state.current = { tag, commit, deployedAt: new Date().toISOString() };
  state.identity = config.identity;
  state.mode = 'maintenance';
  await save();
  await maintenance(config, false);
  state.mode = 'running';
  await stage('Готово');
  console.log('LangPlot: ' + config.origin + '\nПервое приглашение владельца: ./langplot owner');
}
async function transfer() {
  await identity();
  tracking = true;
  state.operation = { command, stage: 'Остановка записи', startedAt: new Date().toISOString() };
  state.mode = 'transfer';
  await save();
  await stopWriters();
  await stage('Финальный архив переноса');
  state.operation.backup = await backup(config, { quiesced: true, tag: await currentTag() });
  await stage('Архив готов; старый сервер не принимает новые записи');
  console.log(
    'Передайте архив на новый сервер и выполните ./langplot restore ПУТЬ. Для отмены переноса: ./langplot resume',
  );
}
async function restore(supplied) {
  if (!supplied) throw Error('Укажите архив: ./langplot restore backups/имя.tar.gz');
  if ((await volume(config, 'postgres-data')) || (await volume(config, 'api-data')))
    throw Error(
      'В этом проекте уже есть тома с данными. Восстановление разрешено только на чистом сервере/в новом LANGPLOT_PROJECT_NAME. Существующие тома не изменены.',
    );
  await identity();
  const bundle = await unpack(config, supplied);
  try {
    compatibleMigrations(bundle.manifest.migrations, await localMigrations(config));
    tracking = true;
    state.operation = {
      command,
      stage: 'Проверка архива',
      archive: bundle.archive,
      startedAt: new Date().toISOString(),
    };
    await save();
    // Build and validate credentials before creating any destination data volume.
    const tag = 'restored-' + Date.now() + '-' + randomBytes(4).toString('hex');
    await stage('Сборка целевого выпуска');
    await compose(config, ['build', 'api', 'web'], { tag });
    await stage('Восстановление базы');
    await compose(config, ['up', '-d', '--no-deps', '--wait', 'postgres'], { tag });
    await compose(
      config,
      [
        'exec',
        '-T',
        'postgres',
        'sh',
        '-c',
        'exec pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error',
        'sh',
        config.database,
      ],
      { input: { file: path.join(bundle.dir, 'database.dump') }, quiet: true },
    );
    await docker(
      config,
      [
        'volume',
        'create',
        '--label',
        `com.docker.compose.project=${config.project}`,
        '--label',
        'com.docker.compose.volume=api-data',
        `${config.project}_api-data`,
      ],
      { quiet: true },
    );
    await appFiles(config, 'restore', {
      input: { file: path.join(bundle.dir, 'persistent-files.json') },
    });
    const restored = await databaseInfo(config);
    if (
      bundle.manifest.counts &&
      Object.entries(bundle.manifest.counts).some(
        ([table, count]) => restored.counts[table] !== count,
      )
    )
      throw Error('Число восстановленных записей не совпало с финальной копией. Сайт не открыт.');
    await stage('Миграции и проверка восстановленного приложения');
    await migrate(tag);
    await start(tag);
    await patchEnv(config.file, { APP_TAG: tag });
    state.identity = config.identity;
    state.mode = 'maintenance';
    state.current = {
      tag,
      deployedAt: new Date().toISOString(),
      restoredFrom: path.basename(bundle.archive),
    };
    await save();
    await maintenance(config, false);
    state.mode = 'running';
    await stage('Восстановление завершено');
    console.log(
      'Аккаунты, сохранения, сообщения и постоянные файлы восстановлены. Адрес: ' +
        config.origin +
        '\nПосле проверки переключите DNS. Старый сервер оставьте без записи до окончания переноса.',
    );
  } finally {
    await removeWorkspace(config, bundle.dir);
  }
}

try {
  if (command === 'init') {
    const file = await initialize(root, process.argv[3]);
    console.log(
      'Окружение: ' + file + '\nДобавьте DEEPSEEK_API_KEY, затем выполните ./langplot deploy.',
    );
  } else {
    if (
      ![
        'deploy',
        'backup',
        'transfer',
        'restore',
        'resume',
        'status',
        'logs',
        'owner',
        'stop',
      ].includes(command)
    )
      throw Error('Неизвестная команда. Выполните ./langplot help.');
    config = await configuration(root, {
      keyRequired: ['deploy', 'restore', 'resume'].includes(command),
    });
    await docker(config, ['info', '--format', '{{.ServerVersion}}'], { quiet: true });
    await compose(config, ['config', '--quiet'], { quiet: true });
    await mkdir(config.stateDir, { recursive: true, mode: 0o700 });
    stateFile = path.join(config.stateDir, 'state.json');
    if (await exists(stateFile)) state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (command === 'deploy') await deploy();
    if (command === 'backup') {
      await identity();
      if (!(await volume(config, 'postgres-data'))) throw Error('Том базы не найден.');
      await compose(config, ['up', '-d', '--no-deps', '--wait', 'postgres']);
      await backup(config, { tag: await currentTag(), quiesced: state.mode === 'transfer' });
    }
    if (command === 'transfer') await transfer();
    if (command === 'restore') await restore(process.argv[3]);
    if (command === 'resume') {
      await identity();
      await compose(config, ['up', '-d', '--no-deps', '--wait', 'postgres']);
      compatibleMigrations((await databaseInfo(config)).migrations, await localMigrations(config));
      await start(await currentTag());
      await maintenance(config, false);
      state.mode = 'running';
      await save();
      console.log('Работа возобновлена.');
    }
    if (command === 'owner') {
      await compose(config, ['exec', '-T', 'api', 'node', 'apps/api/dist/owner-invite.mjs']);
      await compose(config, ['exec', '-T', 'api', 'cat', '/app/var/admin-invite.txt']);
    }
    if (command === 'stop') {
      await compose(config, ['stop']);
      console.log('Контейнеры остановлены. Тома с данными сохранены.');
    }
    if (command === 'logs')
      await compose(config, ['logs', '--tail=80', 'api', 'web', 'migrate', 'caddy']);
    if (command === 'status') {
      await compose(config, ['ps', '-a']);
      console.log('Режим: ' + (state.mode || 'ещё не развёрнут'));
      if (state.operation)
        console.log(
          'Последняя операция: ' +
            state.operation.command +
            ' · ' +
            state.operation.stage +
            (state.operation.failedAt ? ' · ошибка' : ''),
        );
      if (state.operation?.backup) console.log('Последний архив: ' + state.operation.backup);
    }
  }
} catch (error) {
  if (tracking && stateFile && state.operation) {
    state.operation.failedAt = new Date().toISOString();
    await save().catch(() => {});
  }
  console.error(config ? secretText(error.message, config) : error.message);
  if (state.mode === 'maintenance' || state.mode === 'transfer')
    console.error(
      'Запись остаётся закрытой. Данные и резервные копии сохранены. Диагностика: ./langplot status и ./langplot logs.',
    );
  process.exitCode = 1;
}
