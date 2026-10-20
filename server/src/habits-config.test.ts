import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habitsConfigError } from './habits-config.ts';

test('habits config accepts absent, empty and valid lists', () => {
  assert.equal(habitsConfigError(undefined), undefined);
  assert.equal(habitsConfigError([]), undefined);
  assert.equal(habitsConfigError([{ id: 'a', name: 'A', time: '07:30', note: 'n' }, { id: 'b', name: 'B' }]), undefined);
});

test('habits config rejects bad shapes, blanks, duplicate ids and bad times', () => {
  for (const bad of [null, {}, [null], [[]], [{ id: '', name: 'A' }], [{ id: 'a', name: ' ' }], [{ id: 'a' }],
    [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], [{ id: 'a', name: 'A', time: '7:30' }], [{ id: 'a', name: 'A', time: '24:00' }],
    [{ id: 'a', name: 'A', time: '07:60' }], [{ id: 'a', name: 'A', note: 1 }]])
    assert.ok(habitsConfigError(bad), JSON.stringify(bad));
});
