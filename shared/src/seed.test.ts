import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedToConfig } from './seed.ts';

test('converts money keys to cents, keeps nulls and non-money numbers', () => {
  const c = seedToConfig({
    income: { netSalaryPerMonth: 2000, salariesPerYear: 14 },
    coreExpenses: [{ plan: 25.5 }],
    groceryList: { weekly: [{ regularPrice: 4.5, offerPrice: null, qty: 1.7 }] },
    investing: { houseTarget: { propertyPrice: 300000, depositShare: 0.2 } },
  });
  assert.equal(c.income.netSalaryPerMonth, 200000);
  assert.equal(c.income.salariesPerYear, 14);
  assert.equal(c.coreExpenses[0].plan, 2550);
  assert.deepEqual(c.groceryList.weekly[0], { regularPrice: 450, offerPrice: null, qty: 1.7 });
  assert.equal(c.investing.houseTarget.propertyPrice, 30000000);
  assert.equal(c.investing.houseTarget.depositShare, 0.2);
});
