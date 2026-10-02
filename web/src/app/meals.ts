import { Component, computed, inject, resource } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { dayTotals, weekAverage } from '../../../shared/src/diet.ts';
import { fmt } from '../../../shared/src/money.ts';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

@Component({
  selector: 'app-meals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: `
    .ing-row { display: flex; gap: 0.5rem; align-items: center; font-size: 0.9rem; flex-wrap: wrap; }
    .ing-row input { width: 5rem; }
    button.link { border: 0; background: none; color: var(--accent); padding: 0.2rem 0.4rem; cursor: pointer; }
    button.link:hover { color: var(--danger); }
    .note { font-size: 0.85rem; color: var(--muted); }
    .placeholder { color: var(--muted); font-style: italic; }
    .meal-section { margin-bottom: 1.5rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    .meal-section h3 { margin: 0 0 0.5rem; }
  `,
  template: `
    <h1>Meal plan</h1>
    @if (data.error()) {
      <p class="err">Failed to load config.</p>
    }
    @if (cfg(); as c) {
      <div class="toolbar">
        <button class="primary" (click)="save(c)">Save changes</button>
        @if (c.diet.energyTargetIsPlaceholder) {
          <span class="note placeholder">Energy target is a placeholder</span>
        }
      </div>

      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Breakfast</th>
              <th>Lunch</th>
              <th>Snack</th>
              <th>Dinner</th>
              <th>Shake</th>
              <th class="num">Protein (g)</th>
              <th class="num">Energy (kcal)</th>
            </tr>
          </thead>
          <tbody>
            @for (day of days(); track day.day) {
              <tr>
                <td>{{ day.day }}</td>
                @for (slot of slots; track slot) {
                  <td>
                    <select (change)="setMeal(c, day.day, slot, val($event))">
                      @for (m of mealNames(); track m) {
                        <option [value]="m" [selected]="dayMealSelection(day.day, slot) === m">
                          {{ m }}
                        </option>
                      }
                    </select>
                  </td>
                }
                <td class="num">{{ day.protein }} <span class="muted">({{ proteinTarget(c.diet) }})</span></td>
                <td class="num">
                  {{ day.kcal }}
                  <span class="muted">({{ c.diet.energyTargetKcal }})</span>
                </td>
              </tr>
            }
            <tr style="font-weight: 600; background: var(--badge)">
              <td colspan="6">Week average</td>
              <td class="num">{{ avg().protein }} g</td>
              <td class="num">{{ avg().kcal }} kcal</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 style="margin-top: 1.5rem">Meals</h2>
      <p class="note">Raw/dry weights. Typical label values, not measured.</p>
      @for (meal of uniqueMeals(); track meal) {
        <div class="meal-section">
          <h3>{{ meal }}</h3>
          @for (ing of ingredientsForMeal(meal); track ing.ingredient; let i = $index) {
            <div class="ing-row">
              <input
                type="number"
                step="0.1"
                [(ngModel)]="ing.grams"
                (ngModelChange)="markDirty()"
                aria-label="Grams"
              />
              <span style="width: 4rem">g</span>
              <span style="width: 8rem">{{ ing.ingredient }}</span>
              <input
                type="number"
                step="0.1"
                [(ngModel)]="ing.proteinPer100g"
                (ngModelChange)="markDirty()"
                aria-label="Protein g/100"
              />
              <span>g/100</span>
              <input
                type="number"
                step="1"
                [(ngModel)]="ing.kcalPer100g"
                (ngModelChange)="markDirty()"
                aria-label="kcal/100"
              />
              <span>kcal</span>
              <button class="link" (click)="removeIngredient(c, meal, i)">Remove</button>
            </div>
          }
          <div class="ing-row" style="margin-top: 0.5rem">
            <button class="link" (click)="addIngredient(c, meal)">+ Add ingredient</button>
          </div>
        </div>
      }
    }
  `,
})
export class MealsComponent {
  protected fmt = fmt;
  protected slots = ['breakfast', 'lunch', 'snack', 'dinner', 'shake'];
  protected val = val;
  private api = inject(Api);
  protected data = resource({ loader: () => this.api.config() });
  protected cfg = computed(() => this.data.value());

  protected mealNames = computed(() => {
    const cfg = this.cfg();
    if (!cfg) return [];
    const names = new Set<string>();
    for (const ing of cfg.diet.ingredientsPerPortion) {
      names.add(ing.meal);
    }
    return Array.from(names).sort();
  });

  protected uniqueMeals = computed(() => this.mealNames());

  protected days = computed(() => {
    const cfg = this.cfg();
    return cfg ? dayTotals(cfg.diet) : [];
  });

  protected avg = computed(() => {
    const cfg = this.cfg();
    return cfg ? weekAverage(cfg.diet) : { protein: 0, kcal: 0 };
  });

  protected proteinTarget = (diet: Config['diet']): number => {
    return Math.round(diet.bodyWeightKg * diet.proteinPerKg);
  };

  protected dayMealSelection(day: string, slot: string): string {
    const cfg = this.cfg();
    if (!cfg) return '';
    const dayObj = cfg.diet.week.find((d) => (d as Record<string, string>)['day'] === day);
    return dayObj ? (dayObj as Record<string, string>)[slot] : '';
  }

  protected ingredientsForMeal(meal: string) {
    const cfg = this.cfg();
    if (!cfg) return [];
    return cfg.diet.ingredientsPerPortion.filter((ing) => ing.meal === meal);
  }

  protected setMeal(cfg: Config, day: string, slot: string, mealName: string) {
    const dayObj = cfg.diet.week.find((d) => (d as Record<string, string>)['day'] === day);
    if (dayObj) {
      (dayObj as Record<string, string>)[slot] = mealName;
      this.markDirty();
    }
  }

  protected removeIngredient(cfg: Config, meal: string, index: number) {
    const inMeal = cfg.diet.ingredientsPerPortion.filter((ing) => ing.meal === meal);
    const ing = inMeal[index];
    if (ing) {
      cfg.diet.ingredientsPerPortion = cfg.diet.ingredientsPerPortion.filter((x) => x !== ing);
      this.markDirty();
    }
  }

  protected addIngredient(cfg: Config, meal: string) {
    cfg.diet.ingredientsPerPortion.push({
      meal,
      ingredient: 'New ingredient',
      grams: 100,
      proteinPer100g: 10,
      kcalPer100g: 100,
    });
    this.markDirty();
  }

  protected markDirty() {
    // Mark config as modified
  }

  protected save(cfg: Config) {
    this.api.saveConfig(cfg).then(() => {
      this.data.reload();
    });
  }
}
