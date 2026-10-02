import { booleanAttribute, Component, DestroyRef, computed, effect, ElementRef, HostListener, inject, input, model, output, signal, viewChild } from '@angular/core';
import { Icon } from './icons';

export interface ComboOption { value: string; label: string; dot?: string; hollow?: boolean; hint?: string }

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
let uid = 0;

/** `<app-combo [options]="o" [value]="v" (changed)="set($event)" ariaLabel="Group">`: searchable select; `changed` fires on user selection only. */
@Component({
  selector: 'app-combo',
  imports: [Icon],
  template: `
    <button #trigger type="button" class="trigger" aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-label]="ariaLabel()" [title]="selected()?.label ?? ''"
      (click)="toggle()" (keydown)="onTriggerKey($event)">
      @if (selected()?.dot) { <span class="dot" [class.hollow]="selected()!.hollow" [style.--dot]="selected()!.dot"></span> }
      <span class="lbl" [class.ph]="!selected()">{{ selected()?.label ?? placeholder() }}</span>
      <svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    @if (open()) {
      <div class="pop" [style.top.px]="pos().top" [style.left.px]="pos().left" [style.min-width.px]="pos().width" (keydown)="onKey($event)">
        <input #search type="text" autocomplete="off" placeholder="Search…" aria-label="Search" role="combobox" aria-autocomplete="list" aria-expanded="true"
          [attr.aria-controls]="id + '-list'" [attr.aria-activedescendant]="rows().length ? id + '-' + active() : null"
          [value]="query()" (input)="query.set($any($event.target).value); active.set(0)" />
        <ul class="list" role="listbox" [id]="id + '-list'" [attr.aria-label]="ariaLabel()">
          @for (o of rows(); track o.value; let i = $index) {
            <li role="option" [id]="id + '-' + i" [class.act]="i === active()" [attr.aria-selected]="o.value === value() && !o.create" (mousemove)="active.set(i)" (click)="$event.preventDefault(); pick(o)">
              @if (o.dot) { <span class="dot" [class.hollow]="o.hollow" [style.--dot]="o.dot"></span> }
              <span class="lbl">{{ o.create ? 'Create "' + o.label + '"' : o.label }}</span>
              @if (o.hint) { <span class="hint">{{ o.hint }}</span> }
              @if (o.value === value() && !o.create) { <app-icon name="check" [size]="14" /> }
            </li>
          } @empty {
            <li class="none" role="presentation">No matches</li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host { display: inline-block; max-width: 100%; min-width: 0; }
    .trigger { display: flex; align-items: center; gap: var(--sp-2); width: 100%; min-width: 0; min-height: 2rem; text-align: left; font-weight: 400; }
    .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ph, .hint { color: var(--muted); }
    .caret { flex: none; color: var(--muted); }
    .dot { flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--dot, var(--c-other)); }
    .dot.hollow { background: transparent; box-shadow: inset 0 0 0 2px var(--dot, var(--c-other)); }
    .pop { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-1); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--shadow-pop); }
    .pop input { width: 100%; }
    .list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
    li { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm); cursor: pointer; white-space: nowrap; }
    li.act { background: var(--accent-soft); }
    li[aria-selected='true'] { font-weight: 700; }
    li.none { color: var(--muted); cursor: default; }
  `,
})
export class Combo {
  options = input.required<ComboOption[]>();
  value = model<string | null>(null);
  placeholder = input('Select…');
  ariaLabel = input('');
  allowCreate = input(false, { transform: booleanAttribute });
  changed = output<string>();

  protected id = `combo-${uid++}`;
  protected open = signal(false);
  protected query = signal('');
  protected active = signal(0);
  protected pos = signal({ top: 0, left: 0, width: 0 });
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected selected = computed(() => this.options().find((o) => o.value === this.value()));
  protected rows = computed(() => {
    const q = fold(this.query().trim());
    const list: (ComboOption & { create?: boolean })[] = this.options().filter((o) => fold(o.label).includes(q));
    const raw = this.query().trim();
    if (this.allowCreate() && raw && !this.options().some((o) => fold(o.label) === q)) list.push({ value: raw, label: raw, create: true });
    return list;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', this.onScroll, true));
    effect(() => {
      const s = this.search()?.nativeElement;
      if (!s) return;
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    });
    effect(() => {
      const i = this.active();
      if (this.open()) this.el.nativeElement.querySelector(`[id="${this.id}-${i}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  // scrolling inside the list itself must not close it
  private onScroll = (e: Event) => {
    if (!(e.target instanceof Node && this.el.nativeElement.contains(e.target))) this.close();
  };

  protected toggle() {
    if (this.open()) this.close();
    else this.show('');
  }
  private show(q: string) {
    const r = this.trigger().nativeElement.getBoundingClientRect();
    this.pos.set({ top: r.bottom + 4, left: r.left, width: r.width });
    this.query.set(q);
    this.active.set(q ? 0 : Math.max(0, this.rows().findIndex((o) => o.value === this.value())));
    this.open.set(true);
    window.addEventListener('scroll', this.onScroll, true);
  }
  private close(refocus = false) {
    this.open.set(false);
    window.removeEventListener('scroll', this.onScroll, true);
    if (refocus) this.trigger().nativeElement.focus();
  }
  protected pick(o: ComboOption) {
    this.close(true);
    if (o.value === this.value()) return;
    this.value.set(o.value);
    this.changed.emit(o.value);
  }

  protected onTriggerKey(e: KeyboardEvent) {
    if (this.open() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault();
      this.show(e.key);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.show('');
    }
  }
  protected onKey(e: KeyboardEvent) {
    const n = this.rows().length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.active.set((this.active() + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = this.rows()[this.active()];
      if (o) this.pick(o);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
    } else if (e.key === 'Tab') this.close();
  }

  @HostListener('document:click', ['$event'])
  onDoc(e: Event) {
    if (this.open() && !this.el.nativeElement.contains(e.target as Node)) this.close();
  }
  @HostListener('window:resize')
  onResize() {
    if (this.open()) this.close();
  }
}
