// Executed in a short-lived Node container with only the application data volume mounted.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = process.env.LANGPLOT_FILE_ROOT || '/data',
  limit = 48 * 1024 * 1024;
const hash = (data) => createHash('sha256').update(data).digest('hex');
function safe(name) {
  if (
    typeof name !== 'string' ||
    name.length > 1024 ||
    /[\\:\0]/.test(name) ||
    name.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw Error('Недопустимый путь постоянного файла.');
  return path.join(root, name);
}
if (process.argv[1] === 'export') {
  const result = { version: 1, directories: [], files: [] };
  let total = 0;
  async function walk(relative = '', depth = 0) {
    if (depth > 32 || result.files.length + result.directories.length > 10000)
      throw Error('Слишком много постоянных файлов.');
    for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
      const relativeName = relative ? relative + '/' + name : name;
      const file = safe(relativeName),
        stat = await fs.lstat(file);
      if (stat.isDirectory()) {
        result.directories.push(relativeName);
        await walk(relativeName, depth + 1);
      } else if (stat.isFile()) {
        total += stat.size;
        if (total > limit)
          throw Error('Постоянные файлы превышают лимит 48 МиБ. Нужен отдельный файловый бэкап.');
        const data = await fs.readFile(file);
        result.files.push({
          path: relativeName,
          mode: stat.mode & 0o700,
          sha256: hash(data),
          base64: data.toString('base64'),
        });
      } else throw Error('Ссылки и специальные файлы не поддерживаются: ' + relativeName);
    }
  }
  await walk();
  process.stdout.write(JSON.stringify(result));
} else if (process.argv[1] === 'restore') {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 70 * 1024 * 1024) throw Error('Архив постоянных файлов слишком велик.');
    chunks.push(Buffer.from(chunk));
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (
    data.version !== 1 ||
    !Array.isArray(data.files) ||
    !Array.isArray(data.directories) ||
    data.files.length + data.directories.length > 10000
  )
    throw Error('Неизвестный формат постоянных файлов.');
  const seen = new Set();
  let total = 0;
  for (const name of [...data.directories, ...data.files.map((file) => file.path)]) {
    safe(name);
    if (seen.has(name)) throw Error('Повторяющийся путь.');
    seen.add(name);
  }
  for (const file of data.files) {
    if (
      typeof file.base64 !== 'string' ||
      !Number.isInteger(file.mode) ||
      file.mode < 0 ||
      file.mode > 0o700
    )
      throw Error('Некорректные атрибуты файла.');
    const decoded = Buffer.from(file.base64, 'base64');
    total += decoded.length;
    if (
      total > limit ||
      decoded.toString('base64') !== file.base64 ||
      hash(decoded) !== file.sha256
    )
      throw Error('Контрольная сумма постоянного файла не совпадает.');
  }
  if ((await fs.readdir(root)).length)
    throw Error('Том файлов уже содержит данные и не будет перезаписан.');
  for (const name of [...data.directories].sort(
    (a, b) => a.split('/').length - b.split('/').length,
  )) {
    await fs.mkdir(safe(name), { mode: 0o700 });
    await fs.chown(safe(name), 1000, 1000);
  }
  for (const file of data.files) {
    await fs.writeFile(safe(file.path), Buffer.from(file.base64, 'base64'), {
      flag: 'wx',
      mode: file.mode | 0o600,
    });
    await fs.chown(safe(file.path), 1000, 1000);
  }
  await fs.chmod(root, 0o700);
  await fs.chown(root, 1000, 1000);
} else throw Error('Неизвестная операция с файлами.');
