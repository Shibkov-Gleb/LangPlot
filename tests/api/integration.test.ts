import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Server } from 'node:http';
import type { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createDraft } from '../../packages/shared/src/content.js';
let base = '';
let cookie = '';
let server: Server;
let db: PrismaClient;
let recoverJobs: () => Promise<void>;
let recoverChats: () => Promise<void>;
const schema = `langplot_test_${randomUUID().replaceAll('-', '')}`;
async function request(route: string, method = 'GET', data?: unknown, sessionCookie = cookie) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const payload = await response.json();
  return { status: response.status, data: payload, headers: response.headers };
}
beforeAll(async () => {
  process.loadEnvFile(path.resolve('.env'));
  const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  process.env.LOCAL_DEMO_MODE = 'true';
  process.env.NODE_ENV = 'test';
  execFileSync(
    process.execPath,
    [
      path.resolve('apps/api/node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      path.resolve('apps/api/prisma/schema.prisma'),
    ],
    { env: process.env, stdio: 'pipe' },
  );
  ({ db } = await import('../../apps/api/src/db.js'));
  const { app, finishRoutes } = await import('../../apps/api/src/app.js');
  const { registerCoreRoutes } = await import('../../apps/api/src/routes.js');
  const chat = await import('../../apps/api/src/chat-routes.js');
  const studio = await import('../../apps/api/src/studio-routes.js');
  recoverJobs = studio.recoverJobs;
  recoverChats = chat.recoverChats;
  registerCoreRoutes();
  chat.registerChatRoutes();
  studio.registerStudioRoutes();
  finishRoutes();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.on('listening', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  base = `http://127.0.0.1:${address.port}/api`;
}, 45000);
afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (db) {
    if (!/^langplot_test_[a-f0-9]+$/.test(schema)) throw new Error('Unsafe test schema');
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
describe.sequential('PostgreSQL API integration', () => {
  it('guards private routes and creates an HttpOnly demo session', async () => {
    expect((await request('/profile', 'GET', undefined, '')).status).toBe(401);
    const login = await request('/session/demo', 'POST', {});
    expect(login.status).toBe(200);
    const setCookie = login.headers.get('set-cookie')!;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    cookie = setCookie.split(';')[0]!;
    expect((await request('/session')).data.user.isDemo).toBe(true);
  });
  it('saves settings and language across database reconnection', async () => {
    expect(
      (await request('/profile/selection', 'PUT', { language: 'de', level: 'B2' })).status,
    ).toBe(200);
    expect(
      (
        await request('/profile', 'PATCH', {
          name: 'Тестовый пользователь',
          nativeLanguage: 'ru',
          sound: false,
          subtitles: true,
          reducedMotion: true,
        })
      ).status,
    ).toBe(200);
    await db.$disconnect();
    const result = await request('/profile');
    expect(result.data.user).toMatchObject({
      language: 'de',
      level: 'B2',
      name: 'Тестовый пользователь',
      sound: false,
    });
    expect(
      (await request('/profile/selection', 'PUT', { language: 'xx', level: 'A1' })).status,
    ).toBe(400);
  });
  it('isolates play ownership', async () => {
    const play = (await request('/plays/technical', 'POST', { language: 'en' })).data.play;
    const other = await db.user.create({ data: { name: 'Other' } });
    await db.playthrough.update({ where: { id: play.id }, data: { userId: other.id } });
    expect((await request(`/plays/${play.id}`)).status).toBe(404);
  });
  it('atomically saves choices, replays ids, rejects conflicts', async () => {
    const play = (await request('/plays/technical', 'POST', { language: 'en' })).data.play;
    const action = { requestId: randomUUID(), revision: 0, choiceId: 'observe' };
    const results = await Promise.all([
      request(`/plays/${play.id}/actions`, 'POST', action),
      request(`/plays/${play.id}/actions`, 'POST', action),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0]!.data).toEqual(results[1]!.data);
    expect(results[0]!.data.play.revision).toBe(1);
    expect(await db.playEvent.count({ where: { playthroughId: play.id } })).toBe(1);
    expect((await request(`/plays/${play.id}/actions`, 'POST', action)).data).toEqual(
      results[0]!.data,
    );
    expect(
      (await request(`/plays/${play.id}/actions`, 'POST', { ...action, choiceId: 'continue' }))
        .status,
    ).toBe(409);
    expect(
      (await request(`/plays/${play.id}/actions`, 'POST', { ...action, requestId: randomUUID() }))
        .data.error.code,
    ).toBe('REVISION_CONFLICT');
    expect((await request(`/plays/${play.id}`)).data.play.state.flags.observed).toBe(true);
  });
  it('allows only one of two different concurrent choices', async () => {
    const play = (await request('/plays/technical', 'POST', { language: 'de' })).data.play;
    const responses = await Promise.all(
      ['observe', 'continue'].map((choiceId) =>
        request(`/plays/${play.id}/actions`, 'POST', {
          requestId: randomUUID(),
          revision: 0,
          choiceId,
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.playEvent.count({ where: { playthroughId: play.id } })).toBe(1);
  });
  it('persists messages exactly once and retries a failed provider', async () => {
    const play = (await request('/plays/technical', 'POST', { language: 'en' })).data.play;
    const input = { requestId: randomUUID(), text: 'Hello' };
    const first = await request(`/plays/${play.id}/messages`, 'POST', input);
    expect(first.data.exchange.status).toBe('completed');
    expect((await request(`/plays/${play.id}/messages`, 'POST', input)).data.exchange.id).toBe(
      first.data.exchange.id,
    );
    expect(await db.learningAttempt.count({ where: { sourceId: first.data.exchange.id } })).toBe(1);
    const fail = { requestId: randomUUID(), text: '/error' };
    expect((await request(`/plays/${play.id}/messages`, 'POST', fail)).data.exchange.status).toBe(
      'failed',
    );
    expect((await request(`/plays/${play.id}/messages`, 'POST', fail)).data.exchange.status).toBe(
      'completed',
    );
    expect((await request(`/plays/${play.id}/messages`)).data.messages).toHaveLength(2);
  });
  it('cancels generation without applying learning results', async () => {
    const play = (await request('/plays/technical', 'POST', { language: 'en' })).data.play;
    const input = { requestId: randomUUID(), text: '/timeout' };
    const pending = request(`/plays/${play.id}/messages`, 'POST', input);
    let exchange;
    for (let i = 0; i < 30; i++) {
      exchange = await db.chatExchange.findUnique({
        where: { playthroughId_requestId: { playthroughId: play.id, requestId: input.requestId } },
      });
      if (exchange) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(exchange).toBeTruthy();
    expect(
      (await request(`/plays/${play.id}/messages/${input.requestId}/cancel`, 'POST', {})).status,
    ).toBe(200);
    expect((await pending).data.exchange.status).toBe('cancelled');
    expect(await db.learningAttempt.count({ where: { sourceId: exchange!.id } })).toBe(0);
  });
  it('runs the studio graph, exports draft, imports immutable versions, rejects publish', async () => {
    const created = await request('/studio/jobs', 'POST', {
      brief: 'Prepare a neutral skeleton for future review',
      language: 'en',
      level: 'A1',
    });
    expect(created.status).toBe(202);
    let job;
    for (let i = 0; i < 50; i++) {
      job = (await request('/studio/jobs')).data.jobs.find(
        (x: { id: string }) => x.id === created.data.job.id,
      );
      if (job?.status === 'completed') break;
      await new Promise((r) => setTimeout(r, 60));
    }
    expect(job.status).toBe('completed');
    expect(job.report.publishable).toBe(false);
    const exported = await request(`/studio/jobs/${job.id}/export`);
    expect(exported.data.scenes).toEqual([]);
    expect((await request('/studio/import', 'POST', exported.data)).status).toBe(200);
    expect((await request('/studio/import', 'POST', exported.data)).status).toBe(409);
    expect((await request('/studio/publish', 'POST', exported.data)).data.error.code).toBe(
      'NOT_PUBLISHABLE',
    );
  });
  it('rejects path traversal and oversized imports', async () => {
    const p = createDraft('test brief', 'en', 'A1', 'unsafe.test');
    p.resources = [{ id: 'bad', path: 'assets/../../secret.png', mediaType: 'image' }];
    expect((await request('/studio/import', 'POST', p)).status).toBe(400);
    expect((await request('/studio/import', 'POST', { junk: 'x'.repeat(1100000) })).status).toBe(
      413,
    );
  });
  it('marks unfinished work as interrupted after restart', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { demoKey: 'local-explorer' } });
    const job = await db.studioJob.create({
      data: {
        userId: user.id,
        brief: 'Interrupted test',
        language: 'en',
        level: 'A1',
        status: 'running',
      },
    });
    const play = await db.playthrough.findFirstOrThrow({ where: { userId: user.id } });
    const chat = await db.chatExchange.create({
      data: { playthroughId: play.id, requestId: randomUUID(), text: 'Pending test' },
    });
    await recoverJobs();
    await recoverChats();
    expect((await db.studioJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      'interrupted',
    );
    expect((await db.chatExchange.findUniqueOrThrow({ where: { id: chat.id } })).errorCode).toBe(
      'INTERRUPTED',
    );
  });
  it('rejects cross-origin writes and invalidates logout', async () => {
    const result = await fetch(`${base}/profile/selection`, {
      method: 'PUT',
      headers: {
        Origin: 'https://attacker.example',
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ language: 'en', level: 'A1' }),
    });
    expect(result.status).toBe(403);
    expect((await request('/session', 'DELETE', {})).status).toBe(200);
    expect((await request('/profile')).status).toBe(401);
  });
});
