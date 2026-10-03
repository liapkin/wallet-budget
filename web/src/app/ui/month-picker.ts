import { Component, computed, DestroyRef, ElementRef, HostListener, inject, input, model, signal } from '@angular/core';
import { addMonths, currentMonth, monthLabel } from '../format';
import { Icon } from './icons';
import { closeOnOutside } from './popover';

const NAMES = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2000, i, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }));

/** `<app-month-picker [(month)]="m" [months]="optionalList">`; months beyond the current one are disabled unless listed. */
@Component({
  selector: 'app-month-picker',
  imports: [Icon],
  template: `
    <div class="mp" role="group" aria-label="Month" tabindex="0" (keydown.arrowLeft)="step(-1)" (keydown.arrowRight)="step(1)">
      <button class="icon" type="button" aria-label="Previous month" [disabled]="!ok(prev())" (click)="step(-1)"><app-icon name="chevronLeft" /></button>
      <button type="button" class="ghost lbl" aria-haspopup="dialog" [attr.aria-expanded]="open()" (click)="toggle()">{{ label() }}</button>
      <button class="icon" type="button" aria-label="Next month" [disabled]="!ok(next())" (click)="step(1)"><app-icon name="chevronRight" /></button>
      @if (open()) {
        <div class="popover" role="dialog" aria-label="Choose month">
          <div class="yr">
            <button class="icon" type="button" aria-label="Previous year" (click)="year.set(year() - 1)"><app-icon name="chevronLeft" /></button>
            <strong>{{ year() }}</strong>
            <button class="icon" type="button" aria-label="Next year" [disabled]="year() >= maxYear()" (click)="year.set(year() + 1)"><app-icon name="chevronRight" /></button>
          </div>
          <div class="grid">
            @for (n of names; track n; let i = $index) {
              <button type="button" [class.on]="key(i) === month()" [disabled]="!ok(key(i))" [attr.aria-label]="label(key(i))" (click)="pick(key(i))">{{ n }}</button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: inline-block; }
    .mp { position: relative; display: inline-flex; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--shadow-sm); padding: 2px; }
    .lbl { min-width: 9.5rem; color: var(--text); font-weight: 600; }
    .yr { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2); }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-1); }
    .grid button { box-shadow: none; }
  `,
})
export class MonthPicker {
  month = model.required<string>();
  months = input<string[] | null>(null);
  protected names = NAMES;
  protected open = signal(false);
  protected year = signal(0);
  private el = inject(ElementRef);

  constructor() {
    closeOnOutside(this.el, this.open, () => this.open.set(false), inject(DestroyRef));
  }

  protected maxYear = computed(() => Math.max(+currentMonth().slice(0, 4), ...(this.months() ?? []).map((m) => +m.slice(0, 4))));
  protected prev = computed(() => addMonths(this.month(), -1));
  protected next = computed(() => addMonths(this.month(), 1));
  protected label = (m = this.month()) => monthLabel(m);
  protected key = (i: number) => `${this.year()}-${String(i + 1).padStart(2, '0')}`;
  protected ok = (m: string) => {
    const list = this.months();
    return m <= currentMonth() || !!list?.includes(m);
  };

  protected step(n: number) {
    const m = addMonths(this.month(), n);
    if (this.ok(m)) this.month.set(m);
  }
  protected toggle() {
    this.year.set(+this.month().slice(0, 4));
    this.open.update((o) => !o);
  }
  protected pick(m: string) {
    this.month.set(m);
    this.open.set(false);
  }
  @HostListener('keydown.escape')
  onEsc() {
    this.open.set(false);
  }
}
