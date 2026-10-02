import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDelete } from './reconcile.ts';

test('deletes local ids absent from Wallet', () => {
  assert.deepEqual(toDelete(['a', 'b', 'c'], new Set(['a', 'c'])), ['b']);
});

test('empty remote result deletes nothing', () => {
  assert.deepEqual(toDelete(['a', 'b'], new Set()), []);
});
