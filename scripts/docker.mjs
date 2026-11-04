import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const windowsDocker = path.join(
  process.env.ProgramFiles || 'C:/Program Files',
  'Docker/Docker/resources/bin/docker.exe',
);
const executable =
  process.platform === 'win32' && existsSync(windowsDocker) ? windowsDocker : 'docker';
const child = spawn(executable, ['compose', ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', () => {
  console.error('Docker не найден. Установите и запустите Docker Desktop.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
