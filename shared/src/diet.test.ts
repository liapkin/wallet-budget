import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proteinTarget, mealTotals, dayTotals, weekAverage, weeklyIngredientGrams, groceryMonthly } from './diet.ts';
import { seedToConfig } from './seed.ts';

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
