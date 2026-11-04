import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
let server: Server;
let base = '';
beforeAll(async () => {
  Object.assign(process.env, parseEnv(readFileSync('.env', 'utf8')));
  process.env.LOCAL_DEMO_MODE = 'true';
  process.env.NODE_ENV = 'production';
  const { app, finishRoutes } = await import('../../apps/api/src/app.js');
  const { registerStudioRoutes } = await import('../../apps/api/src/studio-routes.js');
  registerStudioRoutes();
  finishRoutes();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Address missing');
  base = `http://127.0.0.1:${address.port}/api`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const { db } = await import('../../apps/api/src/db.js');
  await db.$disconnect();
});
it('disables demo login, studio and old demo cookies in production even if local flag is true', async () => {
  const headers = { 'Content-Type': 'application/json' };
  expect(
    (await fetch(`${base}/session/demo`, { method: 'POST', headers, body: '{}' })).status,
  ).toBe(404);
  expect((await fetch(`${base}/studio/jobs`)).status).toBe(404);
  expect(
    (await fetch(`${base}/profile`, { headers: { Cookie: `langplot_session=${'a'.repeat(64)}` } }))
      .status,
  ).toBe(401);
  expect((await (await fetch(`${base}/session`)).json()).localMode).toBe(false);
});
