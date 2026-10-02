import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupe } from './dedupe.ts';
import type { Rec } from './types.ts';

const rec = (id: number, paymentType: string, dateUtc: string, amountCents = -1000): Rec => ({
  id, source: 'import', account: 'a', category: 'c', amountCents, type: 'Expenses', paymentType, note: '', dateUtc, groupOverride: null,
});
const M = '2026-08-10T12:00:00Z';

test('window edges are inclusive, keeps transfer', () => {
  assert.deepEqual([...dedupe([rec(1, 'MOBILE_PAYMENT', M), rec(2, 'TRANSFER', '2026-08-09T12:00:00Z')])], [[1, 2]]);
  assert.deepEqual([...dedupe([rec(1, 'MOBILE_PAYMENT', M), rec(2, 'TRANSFER', '2026-08-17T12:00:00Z')])], [[1, 2]]);
});

test('outside window or different amount is not a duplicate', () => {
  assert.equal(dedupe([rec(1, 'MOBILE_PAYMENT', M), rec(2, 'TRANSFER', '2026-08-09T11:59:59Z')]).size, 0);
  assert.equal(dedupe([rec(1, 'MOBILE_PAYMENT', M), rec(2, 'TRANSFER', '2026-08-17T12:00:01Z')]).size, 0);
  assert.equal(dedupe([rec(1, 'MOBILE_PAYMENT', M), rec(2, 'TRANSFER', M, -999)]).size, 0);
});

test('each transfer absorbs one mobile payment', () => {
  const d = dedupe([rec(1, 'MOBILE_PAYMENT', M), rec(2, 'MOBILE_PAYMENT', '2026-08-11T12:00:00Z'), rec(3, 'TRANSFER', '2026-08-12T12:00:00Z')]);
  assert.deepEqual([...d], [[1, 3]]);
});
