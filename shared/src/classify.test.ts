import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './classify.ts';
import type { Config, Rec } from './types.ts';

const cfg = {
  wallet: {
    merchantKeywords: [
      { keyword: 'EFOOD', group: 'Takeout' },
      { keyword: 'ATM ', group: 'Cash withdrawal' },
      { keyword: 'Top-Up by', group: 'Transfer' },
    ],
    excludedGroups: ['Cash withdrawal', 'Transfer'],
    categoryMap: [{ walletCategory: 'Fuel', group: 'Fuel' }],
  },
} as Config;
const rec = (o: Partial<Rec>): Rec => ({
  id: 1, source: 'import', account: 'a', category: 'Fuel', amountCents: -100, type: 'Expenses', paymentType: 'CASH', note: '', dateUtc: '2026-01-01T00:00:00Z', groupOverride: null, ...o,
});

test('precedence', () => {
  assert.equal(classify(rec({ groupOverride: 'Car', type: 'Income', note: 'efood' }), cfg), 'Car');
  assert.equal(classify(rec({ type: 'Income', note: 'efood' }), cfg), 'Income');
  assert.equal(classify(rec({ note: 'Order EFood 123' }), cfg), 'Takeout');
  assert.equal(classify(rec({ note: 'shell' }), cfg), 'Fuel');
  assert.equal(classify(rec({ type: 'Income', note: 'Google Pay Top-Up by *1234' }), cfg), 'Transfer');
  assert.equal(classify(rec({ note: 'ATM NB123 ', category: 'Unknown Expense' }), cfg), 'Cash withdrawal');
  assert.equal(classify(rec({ groupOverride: 'Car', note: 'ATM NB1 ' }), cfg), 'Car');
  assert.equal(classify(rec({ category: 'Other', note: 'x' }), cfg), 'Other');
});
