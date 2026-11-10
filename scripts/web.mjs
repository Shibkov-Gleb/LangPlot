import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
const require = createRequire(path.resolve('package.json'));
const command = process.argv[2];
if (!['dev', 'build', 'start'].includes(command)) throw new Error('Unknown Next command');
const port = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3000').port || '3000';
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    command,
    ...(command === 'build' ? [] : ['--hostname', '127.0.0.1', '--port', port]),
  ],
  { stdio: 'inherit', windowsHide: true },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
