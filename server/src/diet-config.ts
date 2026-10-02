export function dietConfigError(diet: unknown): string | undefined {
  if (!diet || typeof diet !== 'object' || Array.isArray(diet)) return 'diet must be an object';
  const value = diet as Record<string, unknown>;
  for (const key of ['bodyWeightKg', 'proteinPerKg', 'energyTargetKcal']) {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return `diet.${key} must be a finite number > 0`;
  }
  if (!Array.isArray(value.week) || !Array.isArray(value.ingredientsPerPortion)) return 'diet week and ingredientsPerPortion must be arrays';
  for (const day of value.week) {
    if (!day || typeof day !== 'object' || Array.isArray(day) || Object.values(day).some(v => typeof v !== 'string'))
      return 'diet week entries must contain strings';
  }
  for (const ingredient of value.ingredientsPerPortion) {
    if (!ingredient || typeof ingredient !== 'object' || Array.isArray(ingredient)) return 'diet ingredients must be objects';
    for (const key of ['meal', 'ingredient'])
      if (typeof ingredient[key] !== 'string' || !ingredient[key].trim()) return `diet ingredient ${key} must be nonempty`;
    for (const key of ['grams', 'proteinPer100g', 'kcalPer100g', 'carbsPer100g', 'fatPer100g']) {
      const n = ingredient[key];
      if ((key === 'carbsPer100g' || key === 'fatPer100g') && n === undefined) continue;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return `diet ingredient ${key} must be a finite number >= 0`;
    }
  }
}
