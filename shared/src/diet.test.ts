import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proteinTarget, mealTotals, dayTotals, weekAverage, weeklyIngredientGrams, groceryMonthly } from './diet.ts';
import { seedToConfig } from './seed.ts';
import type { Config } from './types.ts';

const seed = seedToConfig(JSON.parse(readFileSync(new URL('../../config/seed-config.example.json', import.meta.url), 'utf8')));

test('protein target: bodyWeight * proteinPerKg', () => {
  const target = proteinTarget(seed.diet);
  assert.equal(target, 160);
});

test('meal totals', () => {
  const totals = mealTotals(seed.diet);
  assert.ok(totals['Eggs & bread']);
  assert.ok(totals['Whey shake & creatine']);
  assert.ok(totals['Chicken, rice & veg']);
  // Eggs & bread: 3*50g eggs (150g @ 12.6g/100g = 18.9g), bread 70g @ 9g = 6.3g, tomato 150g @ 0.9g = 1.35g, oil 5g @ 0g = 0
  // Total ~26-27g protein
  assert.ok(totals['Eggs & bread'].protein > 20);
  assert.ok(totals['Eggs & bread'].kcal > 400);
});

test('day totals', () => {
  const days = dayTotals(seed.diet);
  assert.equal(days.length, 7);
  assert.ok(days[0].day);
  assert.ok(days[0].protein > 0);
  assert.ok(days[0].kcal > 0);
});

test('week average matches the mean of the day totals', () => {
  const days = dayTotals(seed.diet);
  const avg = weekAverage(seed.diet);
  assert.ok(Math.abs(avg.protein - days.reduce((s, d) => s + d.protein, 0) / 7) <= 1);
  assert.ok(Math.abs(avg.kcal - days.reduce((s, d) => s + d.kcal, 0) / 7) <= 1);
});

test('legacy nutrition keeps macros unknown without changing protein or calories', () => {
  assert.equal(mealTotals(seed.diet)['Eggs & bread'].carbs, undefined);
  assert.equal(dayTotals(seed.diet)[0].fat, undefined);
  assert.equal(weekAverage(seed.diet).carbs, undefined);
});

test('macros aggregate portions, repeated slots and days; unused missing meals do not contribute', () => {
  const diet: Config['diet'] = { ...seed.diet, week: [
    { day: 'Monday', breakfast: 'Meal', dinner: 'Meal' },
    { day: 'Tuesday', lunch: 'Meal' },
  ], ingredientsPerPortion: [
    { meal: 'Meal', ingredient: 'A', grams: 150, proteinPer100g: 10, kcalPer100g: 100, carbsPer100g: 20.2, fatPer100g: 3 },
    { meal: 'Meal', ingredient: 'B', grams: 50, proteinPer100g: 2, kcalPer100g: 40, carbsPer100g: 10, fatPer100g: 1 },
    { meal: 'Meal', ingredient: 'Empty', grams: 0, proteinPer100g: 0, kcalPer100g: 0 },
    { meal: 'Unused', ingredient: 'Unknown', grams: 100, proteinPer100g: 0, kcalPer100g: 0 },
  ] };
  assert.deepEqual(mealTotals(diet)['Meal'], { protein: 16, kcal: 170, carbs: 35, fat: 5 });
  assert.deepEqual(dayTotals(diet), [
    { day: 'Monday', protein: 32, kcal: 340, carbs: 70, fat: 10 },
    { day: 'Tuesday', protein: 16, kcal: 170, carbs: 35, fat: 5 },
  ]);
  assert.deepEqual(weekAverage(diet), { protein: 24, kcal: 255, carbs: 53, fat: 8 });
});

test('missing macro propagates independently; explicit zero remains known', () => {
  const diet: Config['diet'] = { ...seed.diet, week: [{ day: 'Monday', breakfast: 'Meal' }], ingredientsPerPortion: [
    { meal: 'Meal', ingredient: 'A', grams: 100, proteinPer100g: 2, kcalPer100g: 10, carbsPer100g: 0, fatPer100g: 0 },
    { meal: 'Meal', ingredient: 'B', grams: 100, proteinPer100g: 3, kcalPer100g: 20, fatPer100g: 0 },
  ] };
  for (const totals of [mealTotals(diet)['Meal'], dayTotals(diet)[0], weekAverage(diet)]) {
    assert.equal(totals.carbs, undefined);
    assert.equal(totals.fat, 0);
    assert.equal(totals.protein, 5);
    assert.equal(totals.kcal, 30);
  }
  diet.ingredientsPerPortion[1].carbsPer100g = 0;
  assert.equal(weekAverage(diet).carbs, 0);
});

test('weekly ingredient grams', () => {
  const ings = weeklyIngredientGrams(seed.diet);
  assert.ok(ings['3 eggs (≈50 g each, shelled)']);
  // Eggs appear in breakfast 7 times (once per day)
  assert.equal(ings['3 eggs (≈50 g each, shelled)'], 1050); // 150g * 7 days
});

test('grocery monthly = weekly * 52/12 + pantry; offers lower it', () => {
  const m = groceryMonthly(seed.groceryList, false);
  assert.ok(Math.abs(m.monthly - (m.weekly * 52) / 12 - m.pantry) <= 1);
  assert.ok(groceryMonthly(seed.groceryList, true).monthly < m.monthly);
});
