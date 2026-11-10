import { beforeAll, expect, it } from 'vitest';
import type { CohortPerson } from '../../apps/api/src/report-service.js';
import { DAY, moscowDay } from '../../packages/shared/src/reports';
let measure: typeof import('../../apps/api/src/report-service.js').measure;
beforeAll(async () => {
  process.loadEnvFile('.env');
  ({ measure } = await import('../../apps/api/src/report-service.js'));
});
const now = new Date('2026-11-10T21:05:00Z');
function visitor(age: number, finish: number | null, payment: number | null): CohortPerson {
  const at = new Date(now.getTime() - age * DAY),
    after = (n: number | null) => (n === null ? null : new Date(at.getTime() + n * DAY));
  return {
    at,
    day: moscowDay(at),
    userId: null,
    registered: at,
    started: at,
    subscribed: at,
    finished: after(finish),
    paid: after(payment),
    days: new Set(),
  };
}
it('uses eligible 30-day visitors and a separate denominator for payment after a lesson', () => {
  const people = [visitor(35, 2, 4), visitor(35, 4, 2), visitor(35, null, null), visitor(12, 1, 2)];
  const rows = measure(people, now, true);
  expect(rows.find((m) => m.key === 'paid30')).toMatchObject({ base: 3, count: 2, pending: 1 });
  expect(rows.find((m) => m.key === 'paidAfter')).toMatchObject({ base: 2, count: 1, pending: 1 });
  expect(measure(people, now, false).find((m) => m.key === 'paid30')).toMatchObject({
    enabled: false,
    count: 0,
  });
});
it('closes retention windows at Moscow midnight and keeps immature days pending', () => {
  const p = visitor(3, null, null);
  p.at = new Date('2026-11-09T20:55:00Z');
  p.days.add('2026-11-10');
  const row = (at: Date) => measure([p], at, false).find((m) => m.key === 'd1');
  expect(row(new Date('2026-11-10T20:59:59Z'))).toMatchObject({ count: 0, base: 0, pending: 1 });
  expect(row(now)).toMatchObject({ count: 1, base: 1, pending: 0 });
});
