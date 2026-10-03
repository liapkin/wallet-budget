import { booleanAttribute, Component, DestroyRef, computed, effect, ElementRef, HostListener, inject, input, model, output, signal, viewChild } from '@angular/core';
import { Icon } from './icons';
import { closeOnOutside } from './popover';

export interface ComboOption { value: string; label: string; dot?: string; hollow?: boolean; hint?: string; group?: string }
interface Row { o?: ComboOption & { create?: boolean }; head?: string; n?: number; open?: boolean }

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
let uid = 0;

/** `<app-combo [options]="o" [value]="v" (changed)="set($event)" ariaLabel="Group">`: searchable select; `changed` fires on user selection only.
 *  `grouped` renders collapsible sections by `option.group` (ungrouped options stay flat on top); `recentKey` adds a "Recent" section kept in localStorage. */
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
          @for (r of rows(); track $index; let i = $index) {
            @if (r.head !== undefined) {
              <li role="presentation" class="head" [class.act]="i === active()" (mousemove)="active.set(i)" (click)="$event.preventDefault(); toggleHead(r)">
                <button type="button" role="presentation" tabindex="-1" [id]="id + '-' + i" [attr.aria-expanded]="r.open">
                  <app-icon name="chevronRight" [size]="14" [class.rot]="r.open" />
                  <span class="lbl">{{ r.head }}</span>
                  <span class="hint">{{ r.n }}</span>
                </button>
              </li>
            } @else {
            @let o = r.o!;
            <li role="option" [class.ind]="grouped() && o.group !== undefined" [id]="id + '-' + i" [class.act]="i === active()" [attr.aria-selected]="o.value === value() && !o.create" (mousemove)="active.set(i)" (click)="$event.preventDefault(); pick(o)">
              @if (o.dot) { <span class="dot" [class.hollow]="o.hollow" [style.--dot]="o.dot"></span> }
              <span class="lbl">{{ o.create ? 'Create "' + o.label + '"' : o.label }}</span>
              @if (o.hint) { <span class="hint">{{ o.hint }}</span> }
              @if (o.value === value() && !o.create) { <app-icon name="check" [size]="14" /> }
            </li>
            }
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
    li.head { padding: 0; font-weight: 600; }
    li.head button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: var(--sp-1) var(--sp-2); cursor: pointer; }
    li.head app-icon { display: inline-flex; transition: transform 0.12s; }
    li.head app-icon.rot { transform: rotate(90deg); }
    li.ind { padding-left: calc(var(--sp-2) + 1.25rem); }
    li.none { color: var(--muted); cursor: default; }
  `,
})
export class Combo {
  options = input.required<ComboOption[]>();
  value = model<string | null>(null);
  placeholder = input('Select…');
  ariaLabel = input('');
  allowCreate = input(false, { transform: booleanAttribute });
  grouped = input(false, { transform: booleanAttribute });
  recentKey = input<string>();
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
  private toggled = signal<Record<string, boolean>>({});
  private recent = signal<string[]>([]);
  protected rows = computed<Row[]>(() => {
    const q = fold(this.query().trim());
    const raw = this.query().trim();
    const all = this.options();
    const create: Row[] = this.allowCreate() && raw && !all.some((o) => fold(o.label) === q) ? [{ o: { value: raw, label: raw, create: true } }] : [];
    if (!this.grouped()) return [...all.filter((o) => fold(o.label).includes(q)).map((o) => ({ o })), ...create];
    const out: Row[] = [];
    const sections = new Map<string, ComboOption[]>();
    for (const o of all) {
      if (o.group === undefined) {
        if (fold(o.label).includes(q)) out.push({ o });
      } else if (fold(o.label).includes(q) || fold(o.group).includes(q)) sections.set(o.group, [...(sections.get(o.group) ?? []), o]);
    }
    const cur = this.selected()?.group;
    const add = (g: string, list: ComboOption[], open: boolean) => {
      open = q ? true : (this.toggled()[g] ?? open);
      out.push({ head: g, n: list.length, open });
      if (open) out.push(...list.map((o) => ({ o })));
    };
    if (!q && this.recentKey()) {
      const rec = this.recent().map((v) => all.find((o) => o.value === v)).filter((o): o is ComboOption => !!o);
      if (rec.length) add('Recent', rec, true);
    }
    for (const [g, list] of sections) add(g, list, g === cur);
    return [...out, ...create];
  });

  constructor() {
    closeOnOutside(this.el, this.open, () => this.close(), inject(DestroyRef));
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

  protected toggle() {
    if (this.open()) this.close();
    else this.show('');
  }
  private show(q: string) {
    const r = this.trigger().nativeElement.getBoundingClientRect();
    this.pos.set({ top: r.bottom + 4, left: r.left, width: r.width });
    this.query.set(q);
    this.toggled.set({});
    this.recent.set(this.loadRecent());
    this.active.set(q ? 0 : Math.max(0, this.rows().findIndex((r) => r.o?.value === this.value())));
    this.open.set(true);
  }
  private close(refocus = false) {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }
  private loadRecent(): string[] {
    const k = this.recentKey();
    if (!k) return [];
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  protected toggleHead(r: Row) {
    if (this.query().trim()) return;
    this.toggled.update((t) => ({ ...t, [r.head!]: !r.open }));
  }
  protected pick(o: ComboOption & { create?: boolean }) {
    const k = this.recentKey();
    if (k && !o.create) {
      try {
        localStorage.setItem(k, JSON.stringify([o.value, ...this.loadRecent().filter((v) => v !== o.value)].slice(0, 5)));
      } catch {
        // storage unavailable: recents are a convenience only
      }
    }
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
    } else if (e.key === 'Enter' || (e.key === ' ' && !this.query())) {
      const r = this.rows()[this.active()];
      if (e.key === ' ' && r?.head === undefined) return;
      e.preventDefault();
      if (r?.head !== undefined) this.toggleHead(r);
      else if (r?.o) this.pick(r.o);
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && this.rows()[this.active()]?.head !== undefined && !this.query()) {
      const r = this.rows()[this.active()];
      if (!!r.open === (e.key === 'ArrowLeft')) {
        e.preventDefault();
        this.toggleHead(r);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
    } else if (e.key === 'Tab') this.close();
  }

  @HostListener('window:resize')
  onResize() {
    if (this.open()) this.close();
  }
}
