import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocation, annualInvesting, capsFor, coreActuals, goalEta, monthStatus, plannedGroups, savings, savingsAccounts } from './budget.ts';
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

test('savings: fallback, goal accounts, per-goal have/target', () => {
  assert.deepEqual(savings(real, {}), { total: 500000, emergency: { have: 0, target: 400000 }, sinking: { have: 0, target: 300000 } });
  const c = seed();
  c.allocation.goals.emergency.accounts = ['A'];
  c.allocation.goals.sinking.accounts = ['B'];
  c.allocation.goals.business.accounts = ['A', 'C'];
  c.allocation.cashSavings = 1000;
  const s = savings(c, { A: 5000, B: 700, C: 9, D: 3 });
  assert.equal(s.total, 5000 + 700 + 9 + 1000);
  assert.deepEqual(s.emergency, { have: 5000, target: 400000 });
  assert.deepEqual(s.sinking, { have: 700, target: 300000 });
});

test('savingsAccounts: union of goal accounts', () => {
  const c = seed();
  c.allocation.goals.emergency.accounts = ['A', 'B'];
  c.allocation.goals.business.accounts = ['B', 'C'];
  assert.deepEqual(savingsAccounts(c), ['A', 'B', 'C']);
});

test('core actuals: wallet-fed plus typed, untyped manual assumed at plan, non-standing hidden', () => {
  const r = coreActuals(real, { Groceries: 30000, Fuel: 2000, Transport: 500 }, { groceries: 5000, rent: 40000 });
  const by = Object.fromEntries(r.map((x) => [x.key, x.actual]));
  assert.equal(by['groceries'], 35000);
  assert.equal(by['transport'], 2500);
  assert.equal(by['rent'], 40000);
  const gym = r.find((x) => x.key === 'gym')!;
  assert.equal(gym.actual, gym.plan);
  assert.equal(gym.assumed, true);
  assert.equal(r.find((x) => x.key === 'rent')!.assumed, false);
  assert.equal(coreActuals(real, {}, { gym: 0 }).find((x) => x.key === 'gym')!.actual, 0);
  const st = monthStatus(real, {}, {});
  assert.equal(st.core, st.lines.filter((l) => l.assumed).reduce((s, l) => s + l.plan, 0));
  assert.ok(!('training' in by));
  assert.equal(coreActuals(real, {}, { training: 6000 }).find((x) => x.key === 'training')!.actual, 6000);
});

test('month status', () => {
  const s = monthStatus(real, { Groceries: 10000, Takeout: 2000, Car: 3000, Transfer: 5000, Income: 100 }, { rent: 40000 });
  assert.equal(s.fun, 2000);
  assert.equal(s.unplanned, 3000);
  // typed rent + wallet groceries + untyped utilities, household, gym and phone at plan
  assert.equal(s.core, 50000 + 21000);
  assert.equal(s.investingSoFar, 200000 - 71000 - 2000 - 3000 - 20000);
});

test('goalEta: months to close the gap at the monthly cap', () => {
  assert.equal(goalEta(50000, 0), null);
  assert.equal(goalEta(0, 25000), 0);
  assert.equal(goalEta(50000, 25000), 2);
  assert.equal(goalEta(25001, 25000), 2);
});

test('plannedGroups: everything outside it is unplanned', () => {
  const p = plannedGroups(real);
  for (const g of [...real.allocation.funGroups, ...real.wallet.excludedGroups, 'Income']) assert.ok(p.has(g));
  assert.equal(p.has('Never planned'), false);
  assert.equal(monthStatus(real, { 'Never planned': 700 }, {}).unplanned, 700);
});
