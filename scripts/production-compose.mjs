import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function compose(args, stdio = ['ignore', 'inherit', 'inherit']) {
  const env = path.resolve(root, process.env.LANGPLOT_ENV_FILE || '.env.production');
  await access(env);
  const child = spawn(
    'docker',
    ['compose', '--env-file', env, '-f', path.join(root, 'compose.production.yaml'), ...args],
    {
      cwd: root,
      stdio,
      env: process.env,
    },
  );
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(Error(`Docker Compose завершился с кодом ${code}.`)),
    );
  });
  return { child, done };
}
