import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSpend, breakdown, projectMonthEnd, trendToDay } from './analysis.ts';
import type { Config } from './types.ts';

const cfg = { wallet: { incomeGroups: ['Income'], excludedGroups: ['Transfers'] } } as Config;
const row = (o: Partial<{ isDup: boolean; type: string; grp: string; amountCents: number; dateUtc: string }> = {}) =>
  ({ isDup: false, type: 'Expenses', grp: 'Food', amountCents: -1000, dateUtc: '2026-01-10T10:00:00Z', ...o });

test('isSpend: expenses count, refund in a spend group counts', () => {
  assert.equal(isSpend(row(), cfg), true);
  assert.equal(isSpend(row({ type: 'Income', amountCents: 300 }), cfg), true);
  assert.equal(isSpend(row({ type: 'Income', grp: 'Income' }), cfg), false);
});

test('isSpend: dup and excluded group are skipped', () => {
  assert.equal(isSpend(row({ isDup: true }), cfg), false);
  assert.equal(isSpend(row({ grp: 'Transfers' }), cfg), false);
});

test('breakdown: refund nets against spend, sorted desc', () => {
  const rows = [row({ amountCents: -500 }), row({ amountCents: 200, type: 'Income' }), row({ amountCents: -900, grp: 'Fun' })];
  assert.deepEqual(breakdown(rows, (r) => r.grp), [
    { key: 'Fun', cents: 900, count: 1 },
    { key: 'Food', cents: 300, count: 2 },
  ]);
});

test('trendToDay: Athens day cutoff', () => {
  // 2025-12-31T22:30Z is 2026-01-01 00:30 in Athens (UTC+2): day 1, so counted at cutoff 1 for January
  // 2026-01-31T22:30Z is Feb 1 locally: not in January at cutoff 5, but is day 1 of Feb
  const cur = [row({ amountCents: -400, dateUtc: '2026-02-03T10:00:00Z' })];
  const jan = [
    row({ amountCents: -100, dateUtc: '2026-01-31T22:30:00Z' }), // Feb 1 locally: month belongs elsewhere, day 1 here
    row({ amountCents: -200, dateUtc: '2026-01-05T10:00:00Z' }),
    row({ amountCents: -800, dateUtc: '2026-01-06T10:00:00Z' }), // after cutoff
  ];
  assert.deepEqual(trendToDay(cur, [jan], 5), { Food: { cents: 400, avgCents: 300 } });
  // 22:30Z on the 5th is the 6th in Athens: excluded at cutoff 5
  const late = [row({ amountCents: -100, dateUtc: '2026-01-05T22:30:00Z' }), row({ amountCents: -200, dateUtc: '2026-01-05T10:00:00Z' })];
  assert.equal(trendToDay(cur, [late], 5).Food.avgCents, 200);
});

test('trendToDay: average skips months without the group, zero if none', () => {
  const cur = [row({ amountCents: -100 }), row({ grp: 'Fun', amountCents: -50 })];
  const m1 = [row({ amountCents: -300 })];
  const m2 = [row({ grp: 'Fun', amountCents: -10 })];
  const m3 = [row({ amountCents: -600 })];
  const t = trendToDay(cur, [m1, m2, m3], 31);
  assert.equal(t.Food.avgCents, 450);
  assert.equal(t.Fun.avgCents, 10);
  assert.equal(trendToDay([row()], [[]], 31).Food.avgCents, 0);
});

test('projectMonthEnd: average daily spend so far carried to month end', () => {
  assert.equal(projectMonthEnd(3000, 10, 30), 9000);
  assert.equal(projectMonthEnd(3000, 0, 30), 3000);
  assert.equal(projectMonthEnd(3000, 30, 30), 3000);
});
