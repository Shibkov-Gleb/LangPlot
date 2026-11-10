import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Server } from 'node:http';
import type { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { createDraft } from '../../packages/shared/src/content.js';
import { readFileSync } from 'node:fs';
import { PlayablePackage } from '../../packages/shared/src/content.js';
import { lessonScene } from '../../packages/shared/src/lesson-engine.js';
import lessonPackage from '../../content/lessons/last-row.json';
import { CourseResponse, TheoryResponse } from '../../packages/shared/src/courses.js';
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
}, 90000);
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
  it('lists the course without starting a run or unlocking another profile’s materials', async () => {
    const count = await db.playthrough.count();
    const course = CourseResponse.parse((await request('/courses/en/a2')).data);
    expect(course.lessons.map((l) => l.number)).toEqual(
      Array.from({ length: 90 }, (_, i) => i + 1),
    );
    expect(course.lessons[0]).toMatchObject({
      slug: 'last-row',
      status: 'ready',
      theoryOpen: false,
      replayFrom: null,
    });
    expect(course.lessons[30]?.routeLessons).toHaveLength(2);
    expect(course.lessons.filter((l) => l.status === 'planned')).toHaveLength(0);
    expect((await request('/courses/de/B1')).data.lessons).toEqual([]);
    expect((await request('/courses/fr/a2')).status).toBe(404);
    expect((await request('/lessons/unknown/theory')).status).toBe(404);
    expect((await request('/materials')).data.lessons).toEqual([]);
    expect((await request('/lessons/last-row/theory')).data.error.code).toBe('THEORY_LOCKED');
    expect((await request('/materials', 'GET', undefined, '')).status).toBe(401);
    expect(await db.playthrough.count()).toBe(count);
  });
  it('keeps the ticket, retries, due reviews and Mae messages bound to one run', async () => {
    const start = await request('/lessons/last-row/plays', 'POST', {});
    expect(start.status).toBe(200);
    let play = start.data.play;
    const first = play.id;
    expect((await request('/courses/en/a2')).data.lessons[0]).toMatchObject({
      status: 'active',
      theoryOpen: false,
    });
    expect((await request('/lessons/last-row/theory')).status).toBe(403);
    async function act(choiceId: string, requestId = randomUUID()) {
      const input = { requestId, revision: play.revision, choiceId };
      const res = await request('/plays/' + play.id + '/actions', 'POST', input);
      expect(res.status).toBe(200);
      play = res.data.play;
      return input;
    }
    const messages = () => '/plays/' + play.id + '/messages';
    expect((await request(messages(), 'GET')).status).toBe(409);
    expect(
      (await request(messages(), 'POST', { requestId: randomUUID(), text: 'Hello' })).status,
    ).toBe(409);
    for (const branch of ['keep', 'give']) {
      for (let n = 0; n < 10; n++) await act('next');
      expect(play.state.sceneId).toBe('grammar');
      const attempt = await act('option-1');
      expect(play.state.feedback).toContain('right now');
      const again = await request('/plays/' + play.id + '/actions', 'POST', attempt);
      expect(again.data.play.revision).toBe(play.revision);
      expect(
        await db.learningAttempt.count({
          where: { sourceId: 'lesson:' + play.id + ':' + attempt.requestId },
        }),
      ).toBe(1);
      await act('option-2');
      await act('next');
      await act(branch);
      expect((await request('/plays/' + play.id)).data.play.state.flags.kept).toBe(
        branch === 'keep',
      );
      await act('next');
      await act('next');
      await act('next');
      await act('next');
      await act('next');
      expect(play.state.sceneId).toBe('word-1');
      if (branch === 'give') {
        await db.skillState.updateMany({
          where: { userId: (await request('/profile')).data.user.id, skillId: 'g04' },
          data: { reviewDueAt: new Date(Date.now() - 1000) },
        });
      }
      for (const c of [3, 3, 3, 2, 1, 2]) await act('option-' + c);
      if (branch === 'give') {
        expect(play.state.sceneId).toBe('review-g04');
        await act('option-1');
      }
      expect(play.state.sceneId).toBe('phone');
      expect(
        (
          await request('/plays/' + play.id + '/actions', 'POST', {
            requestId: randomUUID(),
            revision: play.revision,
            choiceId: 'finish',
          })
        ).status,
      ).toBe(409);
      const before = (await request(messages())).data;
      expect(before.opening).toContain(branch === 'keep' ? 'What time' : 'Did you give');
      expect(before.messages).toHaveLength(0);
      const msg = {
        requestId: randomUUID(),
        text: branch === 'keep' ? 'At six ten.' : 'Yes, I did.',
      };
      const responses = await Promise.all([
        request(messages(), 'POST', msg),
        request(messages(), 'POST', msg),
      ]);
      expect(responses.map((r) => r.data.exchange.reply)).toEqual(
        Array(2).fill("Thanks, Lev. I'll check the station log."),
      );
      await act('finish');
      expect(play.state.sceneId).toBe('end');
      expect((await request(messages())).data.messages).toHaveLength(1);
      if (branch === 'keep') {
        const old = play.id;
        const counts = await Promise.all([
          db.playthrough.count(),
          db.playEvent.count(),
          db.learningAttempt.count(),
          db.chatExchange.count(),
        ]);
        const notes = TheoryResponse.parse((await request('/lessons/last-row/theory')).data).notes;
        expect(notes.map((n) => n.title)).toEqual(lessonPackage.lesson.notes.map((n) => n.title));
        expect(notes.find((n) => n.title === 'glove')?.example).toContain('under this glove');
        expect(notes.find((n) => n.kind === 'grammar')?.example).toBe(
          'I usually take the train. Today I am taking the bus.',
        );
        expect((await request('/materials')).data.lessons).toHaveLength(1);
        expect((await request('/courses/en/a2')).data.lessons[0]).toMatchObject({
          status: 'finished',
          theoryOpen: true,
          replayFrom: old,
        });
        expect(
          await Promise.all([
            db.playthrough.count(),
            db.playEvent.count(),
            db.learningAttempt.count(),
            db.chatExchange.count(),
          ]),
        ).toEqual(counts);
        const ret = await Promise.all([
          request('/plays/' + old + '/replay', 'POST', {}),
          request('/plays/' + old + '/replay', 'POST', {}),
        ]);
        expect(ret[0].data.play.id).toBe(ret[1].data.play.id);
        play = ret[0].data.play;
        expect(play.runNumber).toBe(2);
        expect(play.state.sceneId).toBe('arrival');
        expect((await request('/courses/en/a2')).data.lessons[0]).toMatchObject({
          status: 'active',
          theoryOpen: true,
          replayFrom: null,
        });
        expect(
          TheoryResponse.parse((await request('/lessons/last-row/theory')).data).notes,
        ).toEqual(notes);
      }
    }
    expect(
      (await request('/lessons/last-row/runs')).data.runs.map((r: { ticket: string }) => r.ticket),
    ).toEqual(['owen', 'lev']);
    expect((await request('/plays/' + first + '/messages')).data.messages[0].text).toBe(
      'At six ten.',
    );
  }, 30000);
  it('opens only the finished version owned by the reader', async () => {
    const user = await db.user.create({ data: { name: 'Читатель' } });
    const token = randomBytes(32).toString('hex');
    const readerCookie = 'langplot_session=' + token;
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect((await request('/materials', 'GET', undefined, readerCookie)).data.lessons).toEqual([]);
    expect((await request('/lessons/last-row/theory', 'GET', undefined, readerCookie)).status).toBe(
      403,
    );
    const archived = structuredClone(lessonPackage);
    archived.manifest.version = '1.0.0';
    archived.lesson.notes[0]!.meaning = 'перевод из первой версии';
    const v = await db.contentVersion.create({
      data: {
        packageId: archived.manifest.id,
        version: archived.manifest.version,
        language: 'en',
        level: 'A2',
        data: JSON.parse(JSON.stringify(archived)),
      },
    });
    const state = { sceneId: 'end', flags: {}, journal: [], choices: [], visited: ['end'] };
    await db.playthrough.create({
      data: { userId: user.id, contentVersionId: v.id, language: 'en', state },
    });
    const savedTheory = TheoryResponse.parse(
      (await request('/lessons/last-row/theory', 'GET', undefined, readerCookie)).data,
    );
    expect(savedTheory.notes[0]?.meaning).toBe(archived.lesson.notes[0]!.meaning);
    expect(
      TheoryResponse.parse((await request('/lessons/last-row/theory')).data).notes[0]?.meaning,
    ).toBe(lessonPackage.lesson.notes[0]!.meaning);
    expect(
      (await request('/lessons/last-row/plays', 'POST', {}, readerCookie)).data.play.state.sceneId,
    ).toBe('end');
    const original = (await request('/lessons/last-row/plays', 'POST', {}, readerCookie)).data.play;
    const fresh = (await request('/plays/' + original.id + '/replay', 'POST', {}, readerCookie))
      .data.play;
    expect(fresh.contentVersion).toBe(
      lessonPackage.manifest.id + '@' + lessonPackage.manifest.version,
    );
    expect(
      (await request('/plays/' + original.id, 'GET', undefined, readerCookie)).data.play
        .contentVersion,
    ).toBe(archived.manifest.id + '@' + archived.manifest.version);
    expect(
      TheoryResponse.parse(
        (await request('/lessons/last-row/theory', 'GET', undefined, readerCookie)).data,
      ).notes[0]?.meaning,
    ).toBe(archived.lesson.notes[0]!.meaning);
  });
  it('pins inherited story decisions and takes fresh history only when replaying', async () => {
    const start = (await request('/lessons/letter-l/plays', 'POST', {})).data.play;
    expect(start.state.flags).toMatchObject({ kept: false, 'known.kept': true });
    let play = start;
    for (let i = 0; i < 7; i++)
      play = (
        await request('/plays/' + play.id + '/actions', 'POST', {
          requestId: randomUUID(),
          revision: play.revision,
          choiceId: 'next',
        })
      ).data.play;
    expect(play.state.sceneId).toBe('ticket-given-1');
    const before = await db.playthrough.findUniqueOrThrow({ where: { id: start.id } });
    const first = (await request('/lessons/last-row/runs')).data.runs[0];
    await db.playthrough.update({
      where: { id: first.id },
      data: {
        state: {
          sceneId: 'end',
          flags: { kept: true },
          visited: ['end'],
          choices: [],
          journal: [],
        },
      },
    });
    expect((await request('/plays/' + start.id)).data.play.state.flags.kept).toBe(false);
    const c = await db.contentVersion.findUniqueOrThrow({ where: { id: before.contentVersionId } });
    const content = JSON.parse(JSON.stringify(c.data));
    await db.playthrough.update({
      where: { id: start.id },
      data: {
        state: {
          sceneId: 'end',
          flags: play.state.flags,
          visited: ['phone', 'end'],
          choices: [],
          journal: [],
        },
      },
    });
    const fresh = (await request('/plays/' + start.id + '/replay', 'POST', {})).data.play;
    expect(fresh.state.flags.kept).toBe(true);
    expect((await request('/plays/' + start.id)).data.play.state.flags.kept).toBe(false);
    expect(content.lesson.contact).toBe('nell');
  });
  it('keeps routes, ending permissions and post-season reviews bound to owned attempts', async () => {
    const actor = await db.user.create({ data: { name: 'Сезон' } });
    const token = randomBytes(32).toString('hex'),
      ownedCookie = 'langplot_session=' + token;
    await db.session.create({
      data: {
        userId: actor.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const call = (route: string, method = 'GET', data?: unknown) =>
      request(route, method, data, ownedCookie);
    async function seed(slug: string, flags: Record<string, boolean>) {
      const c = PlayablePackage.parse(
        JSON.parse(readFileSync('content/lessons/' + slug + '.json', 'utf8')),
      );
      const v = await db.contentVersion.upsert({
        where: { packageId_version: { packageId: c.manifest.id, version: c.manifest.version } },
        update: {},
        create: {
          packageId: c.manifest.id,
          version: c.manifest.version,
          language: 'en',
          level: 'A2',
          data: JSON.parse(JSON.stringify(c)),
        },
      });
      return db.playthrough.create({
        data: {
          userId: actor.id,
          contentVersionId: v.id,
          language: 'en',
          state: { sceneId: 'end', flags, visited: ['end'], choices: [], journal: [] },
        },
      });
    }
    try {
      await seed('episode-21', { 'e21.a': true });
      await seed('episode-24', { 'e24.a': true });
      await seed('episode-30', { 'e30.a': true, 'story.route-f': false });
      const first = (await call('/lessons/episode-31f/plays', 'POST', {})).data.play;
      expect(first.state.flags['story.route-f']).toBe(true);
      expect((await call('/lessons/episode-31f/runs')).data.course.nextLesson.slug).toBe(
        'episode-32f',
      );
      await seed('episode-85', { 'e85.a': true, 'ending.h': true, 'ending.f': false });
      await db.skillState.create({
        data: {
          userId: actor.id,
          language: 'en',
          skillId: 'g04',
          attempts: 1,
          successes: 0,
          reviewDueAt: new Date(Date.now() - 1000),
        },
      });
      let play = (await call('/lessons/episode-90/plays', 'POST', {})).data.play;
      const content = PlayablePackage.parse(
        JSON.parse(readFileSync('content/lessons/episode-90.json', 'utf8')),
      );
      for (let i = 0; i < 90 && play.state.sceneId !== 'end'; i++) {
        const scene = lessonScene(content, play.state.sceneId)!;
        if (scene.layout === 'phone') {
          const message = (await call('/plays/' + play.id + '/messages')).data;
          expect(message.opening).toContain('The hall is quiet');
          await call('/plays/' + play.id + '/messages', 'POST', {
            requestId: randomUUID(),
            text: 'I wrote the word as I heard it.',
          });
        }
        const result = await call('/plays/' + play.id + '/actions', 'POST', {
          requestId: randomUUID(),
          revision: play.revision,
          choiceId: scene.exercise?.correct ?? scene.choices[0]!.id,
        });
        expect(result.status).toBe(200);
        play = result.data.play;
      }
      expect(play.state.sceneId).toBe('end');
      const original = play.id;
      const review = (await call('/plays/' + original + '/review', 'POST', {})).data.play;
      expect(review.view.postReview).toBe(true);
      const repeated = (await call('/plays/' + original + '/review', 'POST', {})).data.play;
      expect(repeated.id).toBe(review.id);
      const reviewScene = lessonScene(content, review.state.sceneId)!;
      const result = await call('/plays/' + review.id + '/actions', 'POST', {
        requestId: randomUUID(),
        revision: review.revision,
        choiceId: reviewScene.exercise!.correct,
      });
      expect(result.data.play.state.sceneId).toBe('end');
      expect(
        (await call('/plays/' + original)).data.play.state.flags['review.only'],
      ).toBeUndefined();
      const replay = (await call('/plays/' + original + '/replay', 'POST', {})).data.play;
      expect(replay.id).not.toBe(review.id);
      expect(replay.state.sceneId).toBe('arrival');
      expect((await call('/lessons/episode-90/theory')).status).toBe(200);
      expect((await request('/plays/' + original + '/review', 'POST', {})).status).toBe(404);
    } finally {
      await db.user.delete({ where: { id: actor.id } });
    }
  }, 45000);
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
