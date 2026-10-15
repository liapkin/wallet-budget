import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdingsHistory, holdingsSummary } from './crypto.ts';

const latest = { BTC: { priceCents: 5000000, pct24h: 10 }, ETH: { priceCents: 200000, pct24h: -5 }, SOL: { priceCents: 10000, pct24h: 0 } };

test('value rounds to integer cents; symbol match ignores case', () => {
  const s = holdingsSummary([{ symbol: 'btc', amount: 0.000000303, paid: 0 }], latest);
  assert.equal(s.coins[0].valueCents, 2);
  assert.equal(s.totals.valueCents, 2);
});

test('profit and profit % per coin; profit % null when paid is 0', () => {
  const s = holdingsSummary([{ symbol: 'ETH', amount: 2, paid: 300000 }, { symbol: 'SOL', amount: 1, paid: 0 }], latest);
  assert.equal(s.coins[0].profitCents, 100000);
  assert.equal(s.coins[0].profitPct, (100000 / 300000) * 100);
  assert.equal(s.coins[1].profitCents, 10000);
  assert.equal(s.coins[1].profitPct, null);
});

test('best and worst ignore paid 0; null when none', () => {
  const h = [
    { symbol: 'BTC', amount: 1, paid: 2500000 },
    { symbol: 'ETH', amount: 1, paid: 400000 },
    { symbol: 'SOL', amount: 5, paid: 0 },
  ];
  const s = holdingsSummary(h, latest);
  assert.equal(s.best?.symbol, 'BTC');
  assert.equal(s.worst?.symbol, 'ETH');
  const none = holdingsSummary([{ symbol: 'SOL', amount: 1, paid: 0 }], latest);
  assert.equal(none.best, null);
  assert.equal(none.worst, null);
});

test('totals, allocation and value-weighted 24h change', () => {
  const s = holdingsSummary([{ symbol: 'BTC', amount: 1, paid: 4000000 }, { symbol: 'ETH', amount: 10, paid: 1000000 }], latest);
  assert.equal(s.totals.valueCents, 7000000);
  assert.equal(s.totals.paidCents, 5000000);
  assert.equal(s.totals.profitCents, 2000000);
  assert.equal(s.totals.profitPct, 40);
  assert.equal(s.coins[0].allocationPct, (5000000 / 7000000) * 100);
  const prev = 5000000 / 1.1 + 2000000 / 0.95;
  assert.ok(Math.abs(s.totals.pct24h! - (7000000 / prev - 1) * 100) < 1e-9);
});

test('tag subtotals; missing tag is Untagged', () => {
  const s = holdingsSummary([
    { symbol: 'BTC', amount: 1, paid: 4000000, tag: 'Staking' },
    { symbol: 'ETH', amount: 1, paid: 100000, tag: 'Staking' },
    { symbol: 'SOL', amount: 1, paid: 5000 },
  ], latest);
  assert.deepEqual(s.tags.map((t) => [t.tag, t.valueCents, t.paidCents, t.profitCents]), [
    ['Staking', 5200000, 4100000, 1100000],
    ['Untagged', 10000, 5000, 5000],
  ]);
});

test('coins without a quote: null price/value, excluded from totals', () => {
  const s = holdingsSummary([{ symbol: 'BTC', amount: 1, paid: 100 }, { symbol: 'XYZ', amount: 3, paid: 100 }], { BTC: latest.BTC });
  assert.equal(s.coins[1].priceCents, null);
  assert.equal(s.coins[1].valueCents, null);
  assert.equal(s.coins[1].allocationPct, null);
  assert.equal(s.totals.valueCents, 5000000);
});

test('empty portfolio', () => {
  const s = holdingsSummary([], {});
  assert.equal(s.totals.valueCents, 0);
  assert.equal(s.totals.pct24h, null);
  assert.equal(s.totals.profitPct, null);
});

test('history sums amount x price per ts, ordered by ts', () => {
  const rows = [
    { ts: '2026-01-02', symbol: 'ETH', amount: 2, priceCents: 150 },
    { ts: '2026-01-01', symbol: 'BTC', amount: 0.5, priceCents: 1001 },
    { ts: '2026-01-01', symbol: 'ETH', amount: 2, priceCents: 100 },
    { ts: '2026-01-02', symbol: 'BTC', amount: 0.5, priceCents: 1000 },
  ];
  assert.deepEqual(holdingsHistory(rows), [{ ts: '2026-01-01', cents: 701 }, { ts: '2026-01-02', cents: 800 }]);
});
