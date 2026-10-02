import { test } from 'node:test';
import assert from 'node:assert/strict';
import { athensMonth, athensLocalToUtc } from './month.ts';

test('Athens month boundary', () => {
  assert.equal(athensMonth('2026-07-31T22:30:00Z'), '2026-08');
  assert.equal(athensMonth('2026-07-31T20:30:00Z'), '2026-07');
  assert.equal(athensMonth('2026-12-31T21:30:00Z'), '2026-12');
  assert.equal(athensMonth('2026-12-31T22:30:00Z'), '2027-01');
});

test('Athens local to UTC conversion', () => {
  // Summer: UTC+3
  assert.equal(athensLocalToUtc(2026, 9, 30, 21, 16, 12), '2026-09-30T18:16:12.000Z');
  // Winter: UTC+2
  assert.equal(athensLocalToUtc(2026, 1, 15, 3, 0, 0), '2026-01-15T01:00:00.000Z');
  // Round-trip: converted time should map back to Sep month
  assert.equal(athensMonth(athensLocalToUtc(2026, 9, 30, 21, 16, 12)), '2026-09');
});
