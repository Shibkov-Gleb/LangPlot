import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
const require = createRequire(path.resolve('package.json'));
const command = process.argv[2];
if (!['dev', 'build', 'start'].includes(command)) throw new Error('Unknown Next command');
const port =
  process.env.WEB_PORT || new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3000').port || '3000';
const hostname = process.env.WEB_HOST || '127.0.0.1';
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    command,
    ...(command === 'build' ? [] : ['--hostname', hostname, '--port', port]),
  ],
  { stdio: 'inherit', windowsHide: true },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
