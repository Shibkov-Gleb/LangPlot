import { beforeAll, describe, expect, it } from 'vitest';

let readConfig: typeof import('../../apps/api/src/config.js').readConfig;
let isQaRequest: typeof import('../../apps/api/src/config.js').isQaRequest;
beforeAll(async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  ({ readConfig, isQaRequest } = await import('../../apps/api/src/config.js'));
});
const valid = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://test:test@postgres:5432/test',
  WEB_ORIGIN: 'https://langplot.example.com/',
  HOST: '0.0.0.0',
  TRUST_PROXY: '1',
  CHAT_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'test-key',
};
describe('production environment', () => {
  it('accepts a public HTTPS origin and explicit proxy topology', () => {
    expect(readConfig(valid)).toMatchObject({
      WEB_ORIGIN: 'https://langplot.example.com',
      HOST: '0.0.0.0',
      TRUST_PROXY: 1,
    });
    expect(
      readConfig({ ...valid, NODE_ENV: 'development', WEB_ORIGIN: 'http://localhost:3000' })
        .WEB_ORIGIN,
    ).toBe('http://localhost:3000');
  });
  it('refuses insecure production cookies, URL paths and missing chat credentials', () => {
    expect(() => readConfig({ ...valid, WEB_ORIGIN: 'http://langplot.example.com' })).toThrow(
      'HTTPS',
    );
    for (const url of [
      'https://example.com/api',
      'https://name:secret@example.com',
      'https://example.com?token=secret',
    ])
      expect(() => readConfig({ ...valid, WEB_ORIGIN: url })).toThrow('WEB_ORIGIN');
    expect(() => readConfig({ ...valid, DEEPSEEK_API_KEY: '' })).toThrow('DEEPSEEK_API_KEY');
    expect(
      readConfig({ ...valid, DEEPSEEK_API_KEY: '', CHAT_PROVIDER: 'local' }).CHAT_PROVIDER,
    ).toBe('local');
    expect(
      readConfig({ ...valid, DEEPSEEK_API_KEY: '', DEEPSEEK_API: 'alias' }).CHAT_PROVIDER,
    ).toBe('deepseek');
  });
  it('rejects invalid network settings without logging their values', () => {
    expect(() => readConfig({ ...valid, WEB_ORIGIN: 'private-not-a-url' })).toThrow(
      /^Некорректные переменные окружения: WEB_ORIGIN$/,
    );
    for (const extra of [{ PORT: '65536' }, { TRUST_PROXY: '-1' }, { HOST: 'example.com' }])
      expect(() => readConfig({ ...valid, ...extra })).toThrow('переменные окружения');
    expect(() => readConfig({ ...valid, DATABASE_URL: 'private-not-a-url' })).toThrow(
      /^Некорректные переменные окружения: DATABASE_URL$/,
    );
  });
  it('does not let a public header exclude production activity from analytics', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(isQaRequest({ headers: { 'x-langplot-qa': '1' } })).toBe(false);
      process.env.NODE_ENV = 'test';
      expect(isQaRequest({ headers: { 'x-langplot-qa': '1' } })).toBe(true);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
