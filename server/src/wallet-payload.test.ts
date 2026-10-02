import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletPayload } from './wallet-payload.ts';

const base = { accountId: 'a1', categoryId: 'c1', type: 'Expenses', cents: 1250, date: '2026-07-15T14:30', note: 'Lunch' } as const;

test('expense is negative, summer Athens time is UTC+3', () => {
  assert.deepEqual(walletPayload(base), {
    accountId: 'a1',
    amount: { value: -12.5, currencyCode: 'EUR' },
    recordDate: '2026-07-15T11:30:00.000Z',
    categoryId: 'c1',
    note: 'Lunch',
  });
});

test('income is positive, winter Athens time is UTC+2', () => {
  const p = walletPayload({ ...base, type: 'Income', date: '2026-01-15T14:30' });
  assert.equal(p.amount.value, 12.5);
  assert.equal(p.recordDate, '2026-01-15T12:30:00.000Z');
});

test('empty note and missing category are omitted', () => {
  const p = walletPayload({ ...base, note: '', categoryId: undefined });
  assert.ok(!('note' in p) && !('categoryId' in p));
});
