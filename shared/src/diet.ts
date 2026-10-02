import type { Config, GroceryItem } from './types.ts';

export function proteinTarget(diet: Config['diet']): number {
  return Math.round(diet.bodyWeightKg * diet.proteinPerKg);
}

export function mealTotals(diet: Config['diet']): Record<string, { protein: number; kcal: number }> {
  const result: Record<string, { protein: number; kcal: number }> = {};
  const ingredients = diet.ingredientsPerPortion;

  // Group ingredients by meal name
  const byMeal: Record<string, typeof ingredients> = {};
  for (const ing of ingredients) {
    if (!byMeal[ing.meal]) byMeal[ing.meal] = [];
    byMeal[ing.meal].push(ing);
  }

  // Calculate totals per meal
  for (const [meal, ings] of Object.entries(byMeal)) {
    let protein = 0;
    let kcal = 0;
    for (const ing of ings) {
      protein += (ing.grams * ing.proteinPer100g) / 100;
      kcal += (ing.grams * ing.kcalPer100g) / 100;
    }
    result[meal] = { protein: Math.round(protein), kcal: Math.round(kcal) };
  }

  return result;
}

export function dayTotals(diet: Config['diet']): Array<{ day: string; protein: number; kcal: number }> {
  const meals = mealTotals(diet);
  const result: Array<{ day: string; protein: number; kcal: number }> = [];

  for (const dayObj of diet.week) {
    let protein = 0;
    let kcal = 0;

    // Sum across all meal slots (breakfast, lunch, snack, dinner, shake)
    const slots = ['breakfast', 'lunch', 'snack', 'dinner', 'shake'];
    for (const slot of slots) {
      const mealName = (dayObj as Record<string, string>)[slot];
      if (mealName && meals[mealName]) {
        protein += meals[mealName].protein;
        kcal += meals[mealName].kcal;
      }
    }

    result.push({ day: (dayObj as Record<string, string>)['day'], protein, kcal });
  }

  return result;
}

export function weekAverage(diet: Config['diet']): { protein: number; kcal: number } {
  const days = dayTotals(diet);
  const totalProtein = days.reduce((sum, d) => sum + d.protein, 0);
  const totalKcal = days.reduce((sum, d) => sum + d.kcal, 0);
  return {
    protein: Math.round(totalProtein / days.length),
    kcal: Math.round(totalKcal / days.length),
  };
}

export function weeklyIngredientGrams(diet: Config['diet']): Record<string, number> {
  const result: Record<string, number> = {};
  const meals = diet.ingredientsPerPortion;

  // Count how many times each ingredient appears in a week
  const ingredientCountPerWeek: Record<string, number> = {};
  for (const dayObj of diet.week) {
    const slots = ['breakfast', 'lunch', 'snack', 'dinner', 'shake'];
    for (const slot of slots) {
      const mealName = (dayObj as Record<string, string>)[slot];
      for (const ing of meals) {
        if (ing.meal === mealName) {
          if (!ingredientCountPerWeek[ing.ingredient]) ingredientCountPerWeek[ing.ingredient] = 0;
          ingredientCountPerWeek[ing.ingredient]++;
        }
      }
    }
  }

  // Calculate total grams per ingredient
  for (const ing of meals) {
    const count = ingredientCountPerWeek[ing.ingredient] || 0;
    if (count > 0) {
      result[ing.ingredient] = Math.round(ing.grams * count);
    }
  }

  return result;
}

export function itemCost(item: GroceryItem, useOffer: boolean): number {
  const price = useOffer && item.offerPrice != null ? item.offerPrice : item.regularPrice;
  return Math.round(item.qty * price);
}

export function groceryMonthly(
  list: { weekly: GroceryItem[]; pantryMonthly: GroceryItem[] },
  useOffer: boolean,
): { weekly: number; pantry: number; monthly: number } {
  const weekly = list.weekly.reduce((sum, item) => sum + itemCost(item, useOffer), 0);
  const pantry = list.pantryMonthly.reduce((sum, item) => sum + itemCost(item, useOffer), 0);
  const monthly = Math.round(weekly * (52 / 12)) + pantry;
  return { weekly, pantry, monthly };
}
