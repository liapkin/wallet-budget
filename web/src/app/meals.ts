import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { dayTotals, mealTotals, proteinTarget, weekAverage } from '../../../shared/src/diet.ts';
import { fmt } from './format.ts';
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
    .card.plan { padding: 0; overflow: hidden; }
    .card.plan .scroll { border: 0; box-shadow: none; border-radius: 0; }
    .plan table { table-layout: fixed; width: 100%; min-width: 1100px; border-collapse: collapse; }
    .plan th, .plan td { padding: var(--sp-2); min-width: 150px; vertical-align: middle; }
    .plan th:first-child, .plan td:first-child { width: 96px; min-width: 96px; position: sticky; left: 0; background: var(--surface); z-index: 1; text-align: left; }
    .plan thead th { text-align: left; }
    .plan select { width: 100%; min-width: 0; text-overflow: ellipsis; }
    .plan tfoot td { border-top: 1px solid var(--border); }
    .plan .val { font-weight: 700; }
    .plan .val.over { color: var(--bad); }
    .plan .val.under { color: var(--warn); }
    .progress-small { height: 6px; margin-top: var(--sp-1); }
    .meals-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-3); margin: var(--sp-5) 0 var(--sp-2); }
    .meals-head h2 { margin: 0; }
    .meals-head .new { margin-left: auto; display: flex; gap: var(--sp-2); }
    .meal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--sp-4); }
    .meal-grid .card { margin: 0; min-width: 0; padding: var(--sp-3) var(--sp-4); }
    .meal-grid summary { cursor: pointer; padding: var(--sp-1) 0; list-style-position: inside; }
    .meal-head { display: flex; flex-direction: column; margin-bottom: var(--sp-2); }
    .meal-head strong { overflow-wrap: anywhere; }
    .ing-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: var(--fs-sm); margin-top: var(--sp-2); }
    .ing-table th, .ing-table td { padding: var(--sp-1); text-align: left; border-bottom: 1px solid var(--border); }
    .ing-table th { font-weight: 600; color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; }
    .ing-table th.num { text-align: right; }
    .ing-table input { width: 100%; min-width: 0; }
    .ing-table th:last-child, .ing-table td:last-child { width: 36px; }
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

      <div class="card plan">
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                @for (day of days(); track day.day) {
                  <th [title]="day.day">{{ day.day.slice(0, 3) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (slot of slots; track slot) {
                <tr>
                  <th scope="row">{{ slot | titlecase }}</th>
                  @for (day of days(); track day.day) {
                    @let cur = dayMealSelection(day.day, slot);
                    <td>
                      <select [title]="cur" (change)="setMeal(day.day, slot, val($event))">
                        <option value="" [selected]="!cur">—</option>
                        @for (m of mealNames(); track m) {
                          <option [value]="m" [selected]="m === cur">{{ m }}</option>
                        }
                      </select>
                    </td>
                  }
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Protein (g)</th>
                @for (day of days(); track day.day) {
                  <td>
                    <div class="val" [class.over]="day.protein > proteinTgt(c.diet)" [class.under]="day.protein < proteinTgt(c.diet)">{{ day.protein }}</div>
                    <div class="progress progress-small"><i [class.over]="day.protein > proteinTgt(c.diet)" [style.width.%]="Math.min(100, (day.protein / proteinTgt(c.diet)) * 100)"></i></div>
                  </td>
                }
              </tr>
              <tr>
                <th scope="row">Energy (kcal)</th>
                @for (day of days(); track day.day) {
                  <td>
                    <div class="val" [class.over]="day.kcal > c.diet.energyTargetKcal" [class.under]="day.kcal < c.diet.energyTargetKcal">{{ day.kcal }}</div>
                    <div class="progress progress-small"><i [class.over]="day.kcal > c.diet.energyTargetKcal" [style.width.%]="Math.min(100, (day.kcal / c.diet.energyTargetKcal) * 100)"></i></div>
                  </td>
                }
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="meals-head">
        <h2>Meals</h2>
        <span class="muted" style="font-size: var(--fs-sm)">Raw/dry weights. Typical label values, not measured.</span>
        <div class="new">
          <input #nm placeholder="New meal name" />
          <button (click)="newMeal(nm.value); nm.value = ''">+ New meal</button>
        </div>
      </div>

      <div class="meal-grid">
        @for (meal of mealNames(); track meal) {
          <div class="card">
            <div class="meal-head">
              <strong>{{ meal }}</strong>
              <span class="muted" style="font-size: var(--fs-sm)">{{ mealNutrition(meal).protein }}g protein, {{ mealNutrition(meal).kcal }} kcal / portion</span>
            </div>
            <details>
              <summary>Ingredients</summary>
              <table class="ing-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th class="num">Grams</th>
                    <th class="num">P/100g</th>
                    <th class="num">kcal/100g</th>
                    <th></th>
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
            </details>
          </div>
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
