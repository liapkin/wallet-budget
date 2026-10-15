import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cryptoCents, parseQuotes, parseYahoo, pct24h } from './holdings.ts';

test('cryptoCents rounds each holding to integer cents', () => {
  assert.equal(cryptoCents([{ symbol: 'BTC', amount: 0.5, paid: 0 }, { symbol: 'ETH', amount: 2, paid: 0 }], { BTC: { price: 50000.005, pct24h: 0 }, ETH: { price: 1500.123, pct24h: 0 } }), 2500000 + 300025);
});

test('cryptoCents throws naming the missing symbol', () => {
  assert.throws(() => cryptoCents([{ symbol: 'XYZ', amount: 1, paid: 0 }], {}), /XYZ/);
});

test('parseQuotes takes the first entry per symbol', () => {
  const json = { data: { BTC: [{ quote: { EUR: { price: 60000, percent_change_24h: 1.5 } } }, { quote: { EUR: { price: 1 } } }], ETH: [{ quote: { EUR: { price: 3000.5, percent_change_24h: -2 } } }] } };
  assert.deepEqual(parseQuotes(json), { BTC: { price: 60000, pct24h: 1.5 }, ETH: { price: 3000.5, pct24h: -2 } });
});

test('parseQuotes skips symbols without a price', () => {
  assert.deepEqual(parseQuotes({ data: { BTC: [] } }), {});
});

const yahoo = (meta: object) => ({ chart: { result: [{ meta }] } });

test('parseYahoo reads price, previous close and currency', () => {
  assert.deepEqual(parseYahoo(yahoo({ regularMarketPrice: 120.5, chartPreviousClose: 119, currency: 'EUR', symbol: 'VWCE.DE' })), { price: 120.5, prevClose: 119, currency: 'EUR' });
});

test('parseYahoo keeps the GBp currency code as is', () => {
  assert.equal(parseYahoo(yahoo({ regularMarketPrice: 8250, chartPreviousClose: 8200, currency: 'GBp' })).currency, 'GBp');
});

test('parseYahoo throws on missing fields', () => {
  assert.throws(() => parseYahoo({ chart: { result: null } }), /Yahoo/);
  assert.throws(() => parseYahoo(yahoo({ regularMarketPrice: 1, currency: 'EUR' })), /Yahoo/);
});

test('pct24h is the change versus previous close in percent', () => {
  assert.ok(Math.abs(pct24h(110, 100) - 10) < 1e-9);
  assert.ok(Math.abs(pct24h(99, 100) + 1) < 1e-9);
});
