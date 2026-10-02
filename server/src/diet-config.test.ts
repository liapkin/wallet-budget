import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dietConfigError } from './diet-config.ts';

const example = () => JSON.parse(readFileSync(new URL('../../config/seed-config.example.json', import.meta.url), 'utf8')).diet;

test('legacy diet remains valid; optional macros and zero quantities are accepted', () => {
  const diet = example();
  assert.equal(dietConfigError(diet), undefined);
  Object.assign(diet.ingredientsPerPortion[0], { grams: 0, proteinPer100g: 0, kcalPer100g: 0, carbsPer100g: 0, fatPer100g: 0 });
  assert.equal(dietConfigError(diet), undefined);
  diet.ingredientsPerPortion = [];
  assert.equal(dietConfigError(diet), undefined);
});

test('diet targets require finite positive numbers', () => {
  for (const key of ['bodyWeightKg', 'proteinPerKg', 'energyTargetKcal']) {
    for (const invalid of [undefined, null, '10', 0, -1, NaN, Infinity]) {
      const diet = example();
      diet[key] = invalid;
      assert.match(dietConfigError(diet)!, new RegExp(key));
    }
  }
});

test('ingredient nutrition requires finite nonnegative numbers; optional macros can be absent', () => {
  for (const key of ['grams', 'proteinPer100g', 'kcalPer100g', 'carbsPer100g', 'fatPer100g']) {
    for (const invalid of [null, '10', -1, NaN, Infinity]) {
      const diet = example();
      diet.ingredientsPerPortion[0][key] = invalid;
      assert.match(dietConfigError(diet)!, new RegExp(key));
    }
  }
  for (const diet of [null, [], {}, { ...example(), week: null }, { ...example(), ingredientsPerPortion: [null] }])
    assert.ok(dietConfigError(diet));
});

test('config updates persist macros and reject invalid diet before replacing stored config', async () => {
  process.env.DEMO = '1';
  process.env.BUDGET_DB = ':memory:';
  const { updateConfig } = await import('./main.ts');
  const { db, getConfig } = await import('./db.ts');
  const response = { json() {} };
  try {
    const body = getConfig();
    Object.assign(body.diet.ingredientsPerPortion[0], { carbsPer100g: 0, fatPer100g: 2.5 });
    updateConfig({ body } as any, response as any);
    assert.equal(getConfig().diet.ingredientsPerPortion[0].carbsPer100g, 0);
    assert.equal(getConfig().diet.ingredientsPerPortion[0].fatPer100g, 2.5);
    const before = getConfig();
    body.diet.ingredientsPerPortion[0].fatPer100g = -1;
    assert.throws(() => updateConfig({ body } as any, response as any), /fatPer100g/);
    assert.deepEqual(getConfig(), before);
    const clear = getConfig();
    delete clear.diet.ingredientsPerPortion[0].fatPer100g;
    updateConfig({ body: clear } as any, response as any);
    assert.equal(getConfig().diet.ingredientsPerPortion[0].fatPer100g, undefined);
  } finally {
    db.close();
  }
});
