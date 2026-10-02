import { afterRenderEffect, booleanAttribute, Component, DestroyRef, computed, ElementRef, HostListener, inject, input, model, signal } from '@angular/core';
import { athensNow } from '../format';
import { Icon } from './icons';

const pad = (n: number) => String(n).padStart(2, '0');
const shiftDay = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
// Same day-of-month one month away, clamped to the target month's length.
const shiftMonth = (d: string, n: number) => {
  const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1;
  const last = new Date(Date.UTC(y, m + n + 1, 0));
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(Math.min(+d.slice(8, 10), last.getUTCDate()))}`;
};
const dateParts = (d: string, o: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).formatToParts(new Date(d + 'T00:00:00Z')).map((x) => [x.type, x.value]));
const dateLabel = (d: string) => {
  const p = dateParts(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${p['weekday']} ${p['day']} ${p['month']} ${p['year']}`;
};
const monthTitle = (m: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00:00Z'));
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const PRESETS = ['08:00', '13:30', '16:00', '20:00', '22:00'];
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));

/**
 * `<app-date-time [(value)]="v">`: 'YYYY-MM-DDTHH:mm' Athens local. With `dateOnly` the value is 'YYYY-MM-DD' and only the date button shows.
 * Display is en-GB / 24h, independent of the browser locale.
 */
@Component({
  selector: 'app-date-time',
  imports: [Icon],
  template: `
    <div class="dt">
      @if (!dateOnly()) {
        <div class="quick" role="group" aria-label="Quick pick">
          <button type="button" class="chip" [class.on]="date() === today() && time() === nowTime()" (click)="value.set(now())">Now</button>
          <button type="button" class="chip" [class.on]="date() === day(-1)" (click)="setDate(day(-1))">Yesterday</button>
          <button type="button" class="chip" [class.on]="date() === day(-2)" (click)="setDate(day(-2))">2 days ago</button>
        </div>
      }
      <div class="fields">
        <span class="anc">
          <button type="button" class="datebtn" aria-haspopup="dialog" [attr.aria-expanded]="pop() === 'cal'" [attr.aria-label]="'Date, ' + label()" (click)="toggle('cal')">
            <app-icon name="calendar" [size]="16" />{{ label() }}
          </button>
          @if (pop() === 'cal') {
            <div class="popover cal" role="dialog" aria-label="Choose date" (keydown)="onKey($event)">
              <div class="head">
                <button type="button" class="icon" aria-label="Previous month" (click)="go(shiftMonth(focus(), -1))"><app-icon name="chevronLeft" /></button>
                <strong>{{ title() }}</strong>
                <button type="button" class="icon" aria-label="Next month" (click)="go(shiftMonth(focus(), 1))"><app-icon name="chevronRight" /></button>
              </div>
              <div class="days">
                @for (w of week; track w) { <span class="wd" aria-hidden="true">{{ w }}</span> }
                @for (d of cells(); track $index) {
                  @if (d) {
                    <button type="button" class="d" [class.on]="d === date()" [class.today]="d === today()" [class.fut]="d > today()"
                      [attr.data-d]="d" [attr.tabindex]="d === focus() ? 0 : -1" [attr.aria-label]="dayName(d)" [attr.aria-pressed]="d === date()" (click)="setDate(d); pop.set(null)">{{ +d.slice(8) }}</button>
                  } @else { <span></span> }
                }
              </div>
              <button type="button" class="link" (click)="setDate(today()); pop.set(null)">Today</button>
            </div>
          }
        </span>
        @if (!dateOnly()) {
          <span class="anc">
            <span class="timebox">
              <input class="time" type="text" inputmode="numeric" maxlength="5" autocomplete="off" aria-label="Time, 24 hour" placeholder="HH:MM"
                [value]="time()" (input)="onTime($event)" (blur)="$any($event.target).value = time()"
                (keydown.arrowUp)="nudge($event, 1)" (keydown.arrowDown)="nudge($event, -1)" />
              <button type="button" class="icon" aria-haspopup="dialog" [attr.aria-expanded]="pop() === 'time'" aria-label="Choose time" (click)="toggle('time')"><app-icon name="history" [size]="16" /></button>
            </span>
            @if (pop() === 'time') {
              <div class="popover tpop" role="dialog" aria-label="Choose time">
                <div class="presets">
                  <button type="button" (click)="setTime(nowTime()); pop.set(null)">Now</button>
                  @for (p of presets; track p) { <button type="button" [class.on]="p === time()" (click)="setTime(p); pop.set(null)">{{ p }}</button> }
                </div>
                <div class="hours" role="group" aria-label="Hour">
                  @for (h of hours; track h) { <button type="button" [class.on]="h === time().slice(0, 2)" [attr.aria-label]="h + ' hours'" (click)="setTime(h + ':' + time().slice(3)); pop.set(null)">{{ h }}</button> }
                </div>
              </div>
            }
          </span>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .dt { display: flex; flex-direction: column; gap: var(--sp-2); }
    .quick, .fields { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
    .anc { position: relative; }
    .datebtn { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--text); font-weight: 600; }
    .timebox { display: inline-flex; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); box-shadow: var(--shadow-sm); }
    .timebox:focus-within { outline: 2px solid var(--accent); border-color: var(--accent); }
    .time { width: 4.25rem; border: 0; box-shadow: none; outline: 0; background: none; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
    .popover { color: var(--text); }
    .tpop { left: auto; right: 0; width: 17rem; }
    .cal { width: 17rem; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2); }
    .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: var(--sp-2); }
    .wd { text-align: center; color: var(--muted); font-size: var(--fs-xs); }
    .d { height: 2rem; padding: 0; border-color: transparent; box-shadow: none; background: none; color: var(--text); font-weight: 400; }
    .d:hover:not(.on) { background: var(--surface-2); }
    .d.fut:not(.on) { color: var(--muted); }
    .d.today { box-shadow: inset 0 0 0 1.5px var(--accent); }
    .d.on { background: var(--accent); color: var(--accent-text); font-weight: 700; }
    .presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-1); margin-bottom: var(--sp-2); }
    .hours { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; }
    .presets button, .hours button { box-shadow: none; padding: 0.2rem 0; }
    .hours button { border-color: transparent; background: none; font-weight: 400; }
    .hours button.on { background: var(--accent); color: var(--accent-text); font-weight: 700; }
  `,
})
export class DateTime {
  value = model.required<string>();
  dateOnly = input(false, { transform: booleanAttribute });
  protected pop = signal<'cal' | 'time' | null>(null);
  protected focus = signal('');
  protected week = WEEK;
  protected presets = PRESETS;
  protected hours = HOURS;
  protected shiftMonth = shiftMonth;
  private el = inject(ElementRef);

  protected date = computed(() => this.value().slice(0, 10));
  protected time = computed(() => this.value().slice(11, 16) || '00:00');
  protected label = computed(() => dateLabel(this.date()));
  protected title = computed(() => monthTitle(this.focus().slice(0, 7)));
  protected cells = computed(() => {
    const m = this.focus().slice(0, 7);
    const lead = (new Date(m + '-01T00:00:00Z').getUTCDay() + 6) % 7;
    const len = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    return [...Array<string>(lead).fill(''), ...Array.from({ length: len }, (_, i) => `${m}-${pad(i + 1)}`)];
  });
  protected now = athensNow;
  protected today = () => athensNow().slice(0, 10);
  protected nowTime = () => athensNow().slice(11);
  protected day = (n: number) => shiftDay(this.today(), n);
  protected dayName = (d: string) => dateLabel(d);

  constructor() {
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', this.onScroll, true));
    // Keyboard navigation moves `focus`; follow it after the grid has re-rendered.
    afterRenderEffect(() => {
      if (this.pop() === 'cal') this.el.nativeElement.querySelector(`[data-d="${this.focus()}"]`)?.focus();
    });
  }

  private emit(date: string, time: string) {
    this.value.set(this.dateOnly() ? date : `${date}T${time}`);
  }
  protected setDate(d: string) {
    this.emit(d, this.time());
  }
  protected setTime(t: string) {
    this.emit(this.date(), t);
  }
  protected go(d: string) {
    this.focus.set(d);
  }

  protected toggle(p: 'cal' | 'time') {
    if (this.pop() === p) return this.close();
    this.focus.set(this.date());
    this.pop.set(p);
    window.addEventListener('scroll', this.onScroll, true);
  }
  private close() {
    this.pop.set(null);
    window.removeEventListener('scroll', this.onScroll, true);
  }
  // scrolling inside the popover itself must not close it
  private onScroll = (e: Event) => {
    if (!(e.target instanceof Node && this.el.nativeElement.contains(e.target))) this.close();
  };

  protected onKey(e: KeyboardEvent) {
    const step: Record<string, string> = {
      ArrowLeft: shiftDay(this.focus(), -1), ArrowRight: shiftDay(this.focus(), 1),
      ArrowUp: shiftDay(this.focus(), -7), ArrowDown: shiftDay(this.focus(), 7),
      PageUp: shiftMonth(this.focus(), -1), PageDown: shiftMonth(this.focus(), 1),
    };
    const next = step[e.key];
    if (!next) return;
    e.preventDefault();
    this.go(next);
  }

  protected onTime(e: Event) {
    const input = e.target as HTMLInputElement;
    const d = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
    if (d.length === 4 && +d.slice(0, 2) < 24 && +d.slice(2) < 60) this.setTime(input.value);
  }
  protected nudge(e: Event, dir: number) {
    e.preventDefault();
    const step = (e as KeyboardEvent).shiftKey ? 15 : 1;
    const mins = (+this.time().slice(0, 2) * 60 + +this.time().slice(3) + dir * step + 1440) % 1440;
    this.setTime(`${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
  }

  @HostListener('document:click', ['$event'])
  onDoc(e: Event) {
    if (this.pop() && !this.el.nativeElement.contains(e.target as Node)) this.close();
  }
  @HostListener('keydown.escape', ['$event'])
  onEsc(e: Event) {
    if (!this.pop()) return;
    e.preventDefault();
    e.stopPropagation();
    this.close();
  }
}
