import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocation, annualInvesting, capsFor, coreActuals, monthStatus, savings } from './budget.ts';
import { seedToConfig } from './seed.ts';

const seed = () => seedToConfig(JSON.parse(readFileSync(new URL('../../config/seed-config.example.json', import.meta.url), 'utf8')));
const full = seed();
for (const l of full.coreExpenses) l.inPlan = true;
const real = seed();

test('allocation sums to salary, all lines in plan', () => {
  const a = allocation(full);
  assert.equal(a.core, 113000);
  assert.equal(a.core + a.fun + a.sinking + a.investing, a.salary);
  assert.equal(a.investing, 52000);
  assert.equal(annualInvesting(full), 52000 * 12 + 2 * 200000);
});

test('lines with inPlan=false are left out', () => {
  assert.equal(allocation(real).investing, 58000);
  assert.equal(annualInvesting(real), 58000 * 12 + 2 * 200000);
});

test('caps apply from applyFrom; bufferMonth yields null when set', () => {
  assert.equal(capsFor('2026-12', real), null);
  assert.deepEqual(capsFor('2027-01', real), { Takeout: 6000, Kiosk: 3000 });
  const c = seed();
  c.caps.bufferMonth = '2027-02';
  assert.equal(capsFor('2027-02', c), null);
  assert.deepEqual(capsFor('2027-03', c), { Takeout: 6000, Kiosk: 3000 });
});

test('savings: fallback, accounts, floor', () => {
  assert.deepEqual(savings(real, {}), { total: 500000, emergencyFund: 428000, sinkingFund: 72000 });
  const c = seed();
  c.allocation.savingsAccounts = ['A'];
  c.allocation.cashSavings = 1000;
  assert.equal(savings(c, { A: 5000, B: 9 }).total, 6000);
  assert.equal(savings(c, { A: 5000 }).sinkingFund, 0);
});

test('core actuals: wallet-fed plus typed, manual null, non-standing hidden', () => {
  const r = coreActuals(real, { Groceries: 30000, Fuel: 2000, Transport: 500 }, { groceries: 5000, rent: 40000 });
  const by = Object.fromEntries(r.map((x) => [x.key, x.actual]));
  assert.equal(by['groceries'], 35000);
  assert.equal(by['transport'], 2500);
  assert.equal(by['rent'], 40000);
  assert.equal(by['gym'], null);
  assert.ok(!('training' in by));
  assert.equal(coreActuals(real, {}, { training: 6000 }).find((x) => x.key === 'training')!.actual, 6000);
});

test('month status', () => {
  const s = monthStatus(real, { Groceries: 10000, Takeout: 2000, Housing: 999, Car: 3000, Transfer: 5000, Income: 100 }, { rent: 40000 });
  assert.equal(s.fun, 2000);
  assert.equal(s.unplanned, 3000);
  assert.equal(s.core, 50000);
  assert.equal(s.investingSoFar, 200000 - 50000 - 2000 - 3000 - 20000);
});
