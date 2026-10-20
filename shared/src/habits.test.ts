import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, nextReminderAt, streak } from './habits.ts';
import type { Habit } from './types.ts';

const habits: Habit[] = [
  { id: 'a', name: 'A', time: '07:30' },
  { id: 'b', name: 'B', time: '22:00' },
  { id: 'c', name: 'C' },
];
const ids = (h: Habit[]) => h.map((x) => x.id);

test('dueReminders: window is (since, now], skips done and untimed', () => {
  // summer: Athens = UTC+3, 07:30 local = 04:30Z
  assert.deepEqual(ids(dueReminders(habits, '2026-07-10T04:00:00Z', '2026-07-10T05:00:00Z', [])), ['a']);
  assert.deepEqual(ids(dueReminders(habits, '2026-07-10T04:30:00Z', '2026-07-10T05:00:00Z', [])), []);
  assert.deepEqual(ids(dueReminders(habits, '2026-07-10T04:00:00Z', '2026-07-10T04:30:00Z', [])), ['a']);
  assert.deepEqual(ids(dueReminders(habits, '2026-07-10T04:00:00Z', '2026-07-10T05:00:00Z', ['a'])), []);
  assert.deepEqual(ids(dueReminders(habits, '2026-07-10T00:00:00Z', '2026-07-10T20:00:00Z', [])), ['a', 'b']);
});

test('nextReminderAt: today, then tomorrow, DST-safe', () => {
  assert.equal(nextReminderAt(habits, '2026-07-10T05:00:00Z'), Date.parse('2026-07-10T19:00:00Z'));
  assert.equal(nextReminderAt(habits, '2026-07-10T19:00:00Z'), Date.parse('2026-07-11T04:30:00Z'));
  // 2026-03-29 DST starts in Athens (03:00 -> 04:00): 07:30 local is UTC+3 on the 29th, UTC+2 on the 28th
  assert.equal(nextReminderAt(habits, '2026-03-28T20:00:00Z'), Date.parse('2026-03-29T04:30:00Z'));
  assert.equal(nextReminderAt([habits[2]], '2026-07-10T05:00:00Z'), undefined);
  assert.equal(nextReminderAt([], '2026-07-10T05:00:00Z'), undefined);
});

test('streak: consecutive days ending today, or yesterday if today not done', () => {
  assert.equal(streak(['2026-07-10', '2026-07-09', '2026-07-08'], '2026-07-10'), 3);
  assert.equal(streak(['2026-07-09', '2026-07-08'], '2026-07-10'), 2);
  assert.equal(streak(['2026-07-10', '2026-07-08'], '2026-07-10'), 1);
  assert.equal(streak(['2026-07-07'], '2026-07-10'), 0);
  assert.equal(streak(['2026-02-28', '2026-03-01'], '2026-03-01'), 2);
  assert.equal(streak([], '2026-07-10'), 0);
});
