import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recurring, possibleDuplicates, pairKey, suggestGroup, monthClose, yearReview } from './insights.ts';
import { seedToConfig } from './seed.ts';
import { readFileSync } from 'node:fs';
import type { Rec } from './types.ts';

const rec = (id: number, dateUtc: string, amountCents: number, o: Partial<Rec> = {}): Rec => ({
  id, source: 'api', account: 'a', category: 'c', amountCents, type: 'Expenses', paymentType: 'CARD', note: '', dateUtc, groupOverride: null, ...o,
});
const stream = (note: string, amounts: number[], day = 5) =>
  amounts.map((c, i) => rec(100 + i, `2026-${String(i + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00Z`, -c, { note }));
const grp = () => 'Subs';

test('recurring: monthly stream with noisy notes', () => {
  const rs = stream('Netflix card 1234 POS', [1000, 1000, 1000]).map((r, i) => ({ ...r, note: `NETFLIX #${i}77 Card ${i}99` }));
  const [r] = recurring(rs, grp);
  assert.equal(r.merchant, 'netflix');
  assert.equal(r.group, 'Subs');
  assert.equal(r.typicalCents, 1000);
  assert.equal(r.lastDate, '2026-03-05');
  assert.equal(r.nextDate, '2026-04-04'); // last + mean gap (59 days / 2 rounded = 30)
  assert.equal(r.priceChange, undefined);
});

test('recurring: needs 3, monthly gaps, similar amounts', () => {
  assert.equal(recurring(stream('x', [1000, 1000]), grp).length, 0);
  assert.equal(recurring(stream('x', [1000, 1000, 2000]), grp).length, 0);
  const weekly = [0, 7, 14].map((d, i) => rec(i, `2026-01-${String(d + 1).padStart(2, '0')}T10:00:00Z`, -500, { note: 'gym' }));
  assert.equal(recurring(weekly, grp).length, 0);
});

test('recurring: price change on last charge, income ignored', () => {
  const [r] = recurring([...stream('spotify', [1000, 1000, 1200]), rec(9, '2026-03-06T10:00:00Z', 5000, { type: 'Income', note: 'spotify' })], grp);
  assert.deepEqual(r.priceChange, { fromCents: 1000, toCents: 1200 });
});

test('possibleDuplicates: close amount, close date, different account', () => {
  const a = rec(1, '2026-05-01T10:00:00Z', -2500, { account: 'x' });
  const b = rec(2, '2026-05-04T10:00:00Z', -2505, { account: 'y' });
  assert.deepEqual(possibleDuplicates([b, a]), [{ a, b }]);
  assert.equal(possibleDuplicates([a, b], new Set([pairKey(1, 2)])).length, 0);
});

test('possibleDuplicates: rejects far dates, big diff, same account and type, income', () => {
  const a = rec(1, '2026-05-01T10:00:00Z', -2500, { account: 'x' });
  assert.equal(possibleDuplicates([a, rec(2, '2026-05-09T10:00:00Z', -2500, { account: 'y' })]).length, 0);
  assert.equal(possibleDuplicates([a, rec(2, '2026-05-02T10:00:00Z', -2511, { account: 'y' })]).length, 0);
  assert.equal(possibleDuplicates([a, rec(2, '2026-05-02T10:00:00Z', -2500, { account: 'x' })]).length, 0);
  assert.equal(possibleDuplicates([a, rec(2, '2026-05-02T10:00:00Z', 2500, { account: 'y', type: 'Income' })]).length, 0);
  // 1% cap beats the 10 cent cap on small amounts
  assert.equal(possibleDuplicates([rec(1, '2026-05-01T10:00:00Z', -500, { account: 'x' }), rec(2, '2026-05-01T10:00:00Z', -508, { account: 'y' })]).length, 0);
});

test('suggestGroup: best overlap wins, none when no overlap', () => {
  const known = [
    { note: 'Lidl Athens 123', group: 'Groceries' },
    { note: 'Shell fuel station', group: 'Transport' },
    { note: 'unknown', group: 'Other' },
  ];
  const s = suggestGroup(rec(1, '2026-05-01T10:00:00Z', -100, { note: 'LIDL ATHENS 987' }), known)!;
  assert.equal(s.group, 'Groceries');
  assert.equal(s.confidence, 1);
  assert.equal(suggestGroup(rec(1, '2026-05-01T10:00:00Z', -100, { note: 'zzz' }), known), null);
});

test('monthClose: four transfers from config', () => {
  const cfg = seedToConfig(JSON.parse(readFileSync(new URL('../../config/seed-config.example.json', import.meta.url), 'utf8')));
  const items = monthClose(cfg, { Business: 40000, Savings: 100000 }, { investingSoFar: 123456 });
  assert.deepEqual(items.map((i) => i.key), ['invest', 'business', 'sinking', 'emergency']);
  assert.equal(items.every((i) => i.from === 'Main Bank'), true);
  const by = Object.fromEntries(items.map((i) => [i.key, i.cents]));
  assert.equal(by.invest, 123456);
  assert.equal(by.business, 60000); // target 1000.00 - 400.00
  assert.equal(by.sinking, 20000);
  assert.ok(by.emergency > 0);
  assert.equal(monthClose(cfg, {}, { investingSoFar: -5 })[0].cents, 0);
  const none = { ...cfg, allocation: { ...cfg.allocation, monthClose: undefined } };
  assert.deepEqual(monthClose(none, {}, { investingSoFar: 1 }), []);
});

test('yearReview: totals, deltas, best and worst month', () => {
  const c = (cents: number) => ({ cents, count: 1 });
  const s = {
    '2025-01': { Food: c(100), Income: c(-900) },
    '2026-01': { Food: c(300), Fun: c(50), Income: c(-900) },
    '2026-02': { Food: c(100) },
  };
  const y = yearReview(s, 2026, ['Income']);
  assert.equal(y.totalCents, 450);
  assert.equal(y.prevTotalCents, 100);
  assert.deepEqual(y.groups, [
    { group: 'Food', cents: 400, prevCents: 100, deltaCents: 300 },
    { group: 'Fun', cents: 50, prevCents: 0, deltaCents: 50 },
  ]);
  assert.deepEqual(y.best, { month: '2026-02', cents: 100 });
  assert.deepEqual(y.worst, { month: '2026-01', cents: 350 });
  assert.equal(yearReview({}, 2026, []).best, null);
});
