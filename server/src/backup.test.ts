import test from 'node:test';
import assert from 'node:assert/strict';
import { expired } from './backup.ts';

test('expired keeps newest N dated backups and ignores other files', () => {
  const files = ['budget-2026-01-03.db', 'budget-2026-01-01.db', 'notes.txt', 'budget-2026-01-02.db'];
  assert.deepEqual(expired(files, 2), ['budget-2026-01-01.db']);
  assert.deepEqual(expired(files, 5), []);
});
