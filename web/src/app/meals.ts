import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { dayTotals, mealTotals, proteinTarget, weekAverage } from '../../../shared/src/diet.ts';
import { fmt } from '../../../shared/src/money.ts';
import type { Config } from '../../../shared/src/types.ts';
import { Api } from './api';
import { Toast } from './ui/toast';

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
type Row = Record<string, string>;

@Component({
  selector: 'app-meals',
  standalone: true,
  imports: [CommonModule],
  styles: `
    .day-card { display: flex; flex-direction: column; }
    .day-card .card-head { margin-bottom: var(--sp-2); }
    .day-card h3 { font-size: var(--fs); margin: 0 0 var(--sp-2); color: var(--text); font-weight: 600; }
    .day-slots { display: flex; flex-direction: column; gap: var(--sp-2); margin-bottom: var(--sp-3); }
    .slot-row { display: grid; grid-template-columns: 120px 1fr; gap: var(--sp-2); align-items: center; }
    .slot-row label { font-size: var(--fs-sm); color: var(--muted); font-weight: 500; }
    .day-footer { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); padding-top: var(--sp-2); border-top: 1px solid var(--border); }
    .stat { display: flex; align-items: center; gap: var(--sp-1); }
    .stat-label { font-size: var(--fs-xs); color: var(--muted); font-weight: 500; }
    .stat-value { font-size: var(--fs-sm); font-weight: 600; color: var(--text); }
    .progress-small { height: 6px; margin-top: var(--sp-1); }
    .days-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--sp-4); }
    .meal-details { margin-top: var(--sp-5); }
    .meal-details details { margin-bottom: var(--sp-3); }
    .meal-details summary { cursor: pointer; font-weight: 600; padding: var(--sp-2); margin: -var(--sp-2); border-radius: var(--r-sm); }
    .meal-details summary:hover { background: var(--surface-2); }
    .meal-details .ing-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); margin-top: var(--sp-2); }
    .meal-details .ing-table th, .meal-details .ing-table td { padding: var(--sp-2); text-align: left; border-bottom: 1px solid var(--border); }
    .meal-details .ing-table th { font-weight: 600; color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; }
    .meal-details .ing-table input { width: 100%; }
    .add-ing { margin-top: var(--sp-2); }
  `,
  template: `
    <div class="page-head">
      <h1>Meal plan</h1>
    </div>

    @if (data.error()) {
      <p class="err">Failed to load config.</p>
    }
    @if (cfg(); as c) {
      <div class="kpis">
        <div class="kpi">
          <div class="label">Protein target</div>
          <div class="value">{{ proteinTgt(c.diet) }}g</div>
        </div>
        <div class="kpi">
          <div class="label">Weekly avg protein</div>
          <div class="value">{{ avg().protein }}g</div>
          <div class="progress progress-small">
            <i [style.width.%]="Math.min(100, (avg().protein / proteinTgt(c.diet)) * 100)"></i>
          </div>
          <div class="sub">{{ proteinTgt(c.diet) }}g target</div>
        </div>
        <div class="kpi">
          <div class="label">Weekly avg energy</div>
          <div class="value">{{ avg().kcal }}</div>
          <div class="progress progress-small">
            <i [style.width.%]="Math.min(100, (avg().kcal / c.diet.energyTargetKcal) * 100)"></i>
          </div>
          <div class="sub">
            @if (c.diet.energyTargetIsPlaceholder) {
              <span class="badge" style="margin-top: var(--sp-1)">Placeholder target</span>
            } @else {
              {{ c.diet.energyTargetKcal }} kcal target
            }
          </div>
        </div>
      </div>

      <div class="days-grid">
        @for (day of days(); track day.day) {
          <div class="card day-card">
            <h3>{{ day.day }}</h3>
            <div class="day-slots">
              @for (slot of slots; track slot) {
                <div class="slot-row">
                  <label>{{ slot | titlecase }}</label>
                  @let cur = dayMealSelection(day.day, slot);
                  <select (change)="setMeal(day.day, slot, val($event))">
                    <option value="" [selected]="!cur">—</option>
                    @for (m of mealNames(); track m) {
                      <option [value]="m" [selected]="m === cur">{{ m }}</option>
                    }
                  </select>
                </div>
              }
            </div>
            <div class="day-footer">
              <div class="stat">
                <div>
                  <div class="stat-label">Protein</div>
                  <div class="stat-value">{{ day.protein }}g</div>
                  <div class="progress progress-small">
                    <i [style.width.%]="Math.min(100, (day.protein / proteinTgt(c.diet)) * 100)"></i>
                  </div>
                </div>
              </div>
              <div class="stat">
                <div>
                  <div class="stat-label">Energy</div>
                  <div class="stat-value">{{ day.kcal }}</div>
                  <div class="progress progress-small">
                    <i [style.width.%]="Math.min(100, (day.kcal / c.diet.energyTargetKcal) * 100)"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="meal-details">
        <h2>Meals</h2>
        <p class="muted" style="font-size: var(--fs-sm)">Raw/dry weights. Typical label values, not measured.</p>

        <div style="display: flex; gap: var(--sp-2); margin-bottom: var(--sp-3)">
          <input #nm placeholder="New meal name" />
          <button (click)="newMeal(nm.value); nm.value = ''">+ New meal</button>
        </div>

        @for (meal of mealNames(); track meal) {
          <details>
            <summary>{{ meal }} <span class="muted" style="font-size: var(--fs-sm)">{{ mealNutrition(meal).protein }}g protein, {{ mealNutrition(meal).kcal }} kcal</span></summary>
            <div style="padding: var(--sp-3) 0">
              <table class="ing-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th class="num">Grams</th>
                    <th class="num">Protein/100g</th>
                    <th class="num">kcal/100g</th>
                    <th style="width: 40px"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of ingredientsForMeal(meal); track $index) {
                    <tr>
                      <td><input [value]="r.ing.ingredient" (change)="setName(r.i, val($event))" /></td>
                      <td><input type="number" step="0.1" [value]="r.ing.grams" (change)="setNum(r.i, 'grams', $event)" /></td>
                      <td><input type="number" step="0.1" [value]="r.ing.proteinPer100g" (change)="setNum(r.i, 'proteinPer100g', $event)" /></td>
                      <td><input type="number" step="1" [value]="r.ing.kcalPer100g" (change)="setNum(r.i, 'kcalPer100g', $event)" /></td>
                      <td><button class="icon danger" (click)="removeIngredient(r.i)" title="Delete">−</button></td>
                    </tr>
                  }
                </tbody>
              </table>
              <button class="link" (click)="addIngredient(meal)" style="margin-top: var(--sp-2)">+ Add ingredient</button>
            </div>
          </details>
        }
      </div>

      @if (dirty()) {
        <div class="savebar">
          Unsaved changes
          <button class="ghost" (click)="discard()">Discard</button>
          <button class="primary" (click)="save()">Save</button>
        </div>
      }
    }
  `,
})
export class MealsComponent {
  protected fmt = fmt;
  protected slots = ['breakfast', 'lunch', 'snack', 'dinner', 'shake'];
  protected val = val;
  protected Math = Math;
  private api = inject(Api);
  private toast = inject(Toast);
  protected data = resource({ loader: () => this.api.config() });
  protected cfg = computed(() => this.data.value());
  protected draft = signal<Config | null>(null);
  protected dirty = computed(() => {
    const cfg = this.cfg();
    const dft = this.draft();
    if (!cfg || !dft) return false;
    return JSON.stringify(cfg) !== JSON.stringify(dft);
  });

  constructor() {
    // Keep draft in sync with loaded config
    effect(() => {
      const cfg = this.cfg();
      if (cfg) this.draft.set(structuredClone(cfg));
    });
  }

  protected proteinTgt = (diet: Config['diet']): number => {
    return proteinTarget(diet);
  };

  protected mealNames = computed(() => {
    const dft = this.draft();
    if (!dft) return [];
    const names = new Set<string>();
    for (const ing of dft.diet.ingredientsPerPortion) names.add(ing.meal);
    for (const d of dft.diet.week as unknown as Row[]) {
      for (const slot of this.slots) if (d[slot]) names.add(d[slot]);
    }
    return Array.from(names).sort();
  });

  protected days = computed(() => {
    const dft = this.draft();
    return dft ? dayTotals(dft.diet) : [];
  });

  protected avg = computed(() => {
    const dft = this.draft();
    return dft ? weekAverage(dft.diet) : { protein: 0, kcal: 0 };
  });

  protected mealNutrition = (meal: string) => {
    const dft = this.draft();
    if (!dft) return { protein: 0, kcal: 0 };
    const totals = mealTotals(dft.diet);
    return totals[meal] || { protein: 0, kcal: 0 };
  };

  protected dayMealSelection(day: string, slot: string): string {
    const dft = this.draft();
    if (!dft) return '';
    const dayObj = dft.diet.week.find((d) => (d as Record<string, string>)['day'] === day);
    return dayObj ? (dayObj as Record<string, string>)[slot] || '' : '';
  }

  protected ingredientsForMeal(meal: string) {
    const dft = this.draft();
    if (!dft) return [];
    return dft.diet.ingredientsPerPortion.flatMap((ing, i) => (ing.meal === meal ? [{ ing, i }] : []));
  }

  // all edits clone the draft so signals notify
  private edit(fn: (c: Config) => void) {
    this.draft.update((d) => {
      const c = structuredClone(d!);
      fn(c);
      return c;
    });
  }

  protected setMeal(day: string, slot: string, mealName: string) {
    this.edit((c) => {
      const d = (c.diet.week as unknown as Row[]).find((x) => x['day'] === day);
      if (d) d[slot] = mealName;
    });
  }

  protected setName(i: number, v: string) {
    this.edit((c) => (c.diet.ingredientsPerPortion[i].ingredient = v));
  }

  protected setNum(i: number, k: 'grams' | 'proteinPer100g' | 'kcalPer100g', e: Event) {
    const el = e.target as HTMLInputElement;
    const n = Number(el.value);
    if (el.value.trim() === '' || !isFinite(n)) {
      el.value = String(this.draft()!.diet.ingredientsPerPortion[i][k]);
      return;
    }
    this.edit((c) => (c.diet.ingredientsPerPortion[i][k] = n));
  }

  protected removeIngredient(i: number) {
    this.edit((c) => c.diet.ingredientsPerPortion.splice(i, 1));
  }

  protected addIngredient(meal: string) {
    this.edit((c) =>
      c.diet.ingredientsPerPortion.push({ meal, ingredient: 'New ingredient', grams: 100, proteinPer100g: 10, kcalPer100g: 100 }),
    );
  }

  protected newMeal(name: string) {
    name = name.trim();
    if (name && !this.mealNames().includes(name)) this.addIngredient(name);
  }

  protected discard() {
    const cfg = this.cfg();
    if (cfg) this.draft.set(structuredClone(cfg));
  }

  protected save() {
    this.api
      .saveConfig(this.draft()!)
      .then(() => {
        this.toast.show('Meal plan saved', 'ok');
        this.data.reload();
      })
      .catch(() => {
        this.toast.show('Failed to save meal plan', 'err');
      });
  }
}
