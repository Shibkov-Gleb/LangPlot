import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const api = path.join(root, 'apps/api');
const manifest = JSON.parse(await readFile(path.join(api, 'package.json'), 'utf8'));
const external = Object.entries(manifest.dependencies)
  .filter(([, version]) => !version.startsWith('workspace:'))
  .map(([name]) => name);
await build({
  absWorkingDir: api,
  entryPoints: {
    server: 'src/server.ts',
    'owner-invite': 'src/owner-invite.ts',
    content: 'src/cli.ts',
  },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external,
  logLevel: 'info',
});
