import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from './projection.ts';

const seed = {
  years: 15, grossReturn: 0.07, ter: 0.0022, inflation: 0.02, tradingCostPerYear: 500,
  netSalaryGrowth: 0.025, houseFundFirst: false, houseFundReturn: 0.025, houseCash: 9_000_000,
};

test('higher investing covers house cash earlier', () => {
  const p = project({ ...seed, annualInvesting: 500000 });
  assert.equal(p.rows.length, 15);
  const earlier = project({ ...seed, annualInvesting: 800000 }).coversHouseYear!;
  assert.ok(p.coversHouseYear! > earlier && earlier >= 1);
});

test('year 1 contribution, balance and real value', () => {
  const [y1] = project({ ...seed, annualInvesting: 500000 }).rows;
  const r = 0.07 - 0.0022;
  assert.equal(y1.contribution, 499500);
  assert.equal(y1.etf, Math.round(499500 * (1 + r / 2)));
  assert.ok(Math.abs(y1.real - y1.total / 1.02) <= 1);
});

test('houseFundFirst fills the house fund before the ETF', () => {
  const p = project({ ...seed, annualInvesting: 500000, houseFundFirst: true });
  assert.ok(p.rows[0].houseFund > 0 && p.rows[0].etf === 0);
  assert.ok(p.rows[14].etf > 0);
});

test('never covered returns null', () => {
  assert.equal(project({ ...seed, annualInvesting: 1000, houseCash: 1e12 }).coversHouseYear, null);
});
