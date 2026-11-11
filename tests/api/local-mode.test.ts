import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
let server: Server;
let base = '';
beforeAll(async () => {
  Object.assign(process.env, parseEnv(readFileSync('.env', 'utf8')));
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.WEB_ORIGIN = 'https://localhost:3000';
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
}, 45000);
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  const { db } = await import('../../apps/api/src/db.js');
  await db.$disconnect();
});
it('removes demo login and protects the studio in production', async () => {
  const headers = { 'Content-Type': 'application/json' };
  expect(
    (await fetch(`${base}/session/demo`, { method: 'POST', headers, body: '{}' })).status,
  ).toBe(404);
  expect((await fetch(`${base}/studio/jobs`)).status).toBe(401);
  expect(
    (await fetch(`${base}/profile`, { headers: { Cookie: `langplot_session=${'a'.repeat(64)}` } }))
      .status,
  ).toBe(401);
  expect((await (await fetch(`${base}/session`)).json()).localMode).toBe(false);
});
