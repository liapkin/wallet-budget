import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { Api, type Row } from './api';
import { dayLabel, fmt, groupColor, groupDot, HOLLOW } from './format';
import { Combo, type ComboOption } from './ui/combo';
import { Refresh } from './ui/refresh';
import { Toast } from './ui/toast';

const errMsg = (e: any) => e?.error?.error ?? (e instanceof Error ? e.message : 'Request failed');
const amount = (r: Row) => (r.type === 'Income' ? '+' : '−') + fmt(Math.abs(r.amountCents));
const daysApart = (a: Row, b: Row) => Math.round(Math.abs(Date.parse(a.dateUtc) - Date.parse(b.dateUtc)) / 86_400_000);

@Component({
  selector: 'app-inbox',
  imports: [Combo],
  template: `
    <div class="page-head"><h1>Inbox</h1></div>
    <div class="seg" role="group" aria-label="Inbox">
      <button type="button" [class.on]="tab() === 'dups'" (click)="tab.set('dups')">Possible duplicates ({{ dups.value()?.length ?? 0 }})</button>
      <button type="button" [class.on]="tab() === 'unc'" (click)="tab.set('unc')">Unclassified ({{ unc.value()?.length ?? 0 }})</button>
    </div>

    @if (tab() === 'dups') {
      @if (dups.error()) {
        <p class="err">Failed to load possible duplicates.</p>
      } @else if (!dups.hasValue()) {
        <div class="skeleton" style="height: 10rem"></div>
      } @else if (!dups.value()!.length) {
        <div class="empty"><strong>All clear</strong><span>No possible duplicates.</span></div>
      } @else {
        @for (p of dups.value()!; track p.a.id + '-' + p.b.id) {
          <section class="card">
            <div class="card-head">
              <span class="muted">Differ by {{ fmt(diff(p.a, p.b)) }}, {{ daysApart(p.a, p.b) }} {{ daysApart(p.a, p.b) === 1 ? 'day' : 'days' }} apart</span>
              <div class="actions">
                <button class="primary" (click)="decide(p.a, p.b, 'dup')">Same payment</button>
                <button (click)="decide(p.a, p.b, 'not')">Different</button>
              </div>
            </div>
            <div class="pair">
              @for (r of [p.a, p.b]; track r.id) {
                <dl class="rec">
                  <dt>Date</dt><dd>{{ day(r.dateUtc) }}</dd>
                  <dt>Account</dt><dd>{{ r.account }}</dd>
                  <dt>Note</dt><dd>{{ r.note || '—' }}</dd>
                  <dt>Category</dt><dd>{{ r.category || '—' }}</dd>
                  <dt>Payment</dt><dd>{{ r.paymentType || '—' }}</dd>
                  <dt>Amount</dt><dd class="strong">{{ amount(r) }}</dd>
                </dl>
              }
            </div>
          </section>
        }
      }
    } @else {
      @if (unc.error()) {
        <p class="err">Failed to load unclassified records.</p>
      } @else if (!unc.hasValue()) {
        <div class="skeleton" style="height: 10rem"></div>
      } @else if (!unc.value()!.length) {
        <div class="empty"><strong>All clear</strong><span>Every record has a group.</span></div>
      } @else {
        <div class="scroll tall">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all" [checked]="allSelected()" (change)="toggleAll()" /></th>
                <th>Date</th><th>Note</th><th>Suggested</th><th>Group</th><th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              @for (r of unc.value()!; track r.id) {
                <tr>
                  <td><input type="checkbox" aria-label="Select record" [checked]="sel().has(r.id)" (change)="toggle(r.id)" /></td>
                  <td class="nowrap muted">{{ day(r.dateUtc) }}</td>
                  <td>
                    <div class="strong">{{ r.note || '—' }}</div>
                    <div class="muted sm">{{ r.account }} @if (r.category) { <span>{{ r.category }}</span> }</div>
                  </td>
                  <td>
                    @if (r.suggestion; as s) {
                      <button class="chip" [title]="'Accept ' + s.group" (click)="apply([r.id], s.group)">
                        <span class="dot" [class.hollow]="hollow(s.group)" [style.--dot]="color(s.group)"></span>{{ s.group }}
                      </button>
                    }
                  </td>
                  <td class="gcell">
                    <app-combo [options]="groupOptions()" [value]="''" placeholder="Set group" (changed)="$event && apply([r.id], $event)" ariaLabel="Group" />
                    <button class="link" (click)="kw.set(kw()?.id === r.id ? null : { id: r.id, keyword: r.note, group: r.suggestion?.group ?? '' })">Always</button>
                    @if (kw()?.id === r.id) {
                      <form class="popover" (submit)="addKeyword($event)">
                        <div class="pform">
                          <span>Always classify notes containing</span>
                          <input name="keyword" [value]="kw()!.keyword" required />
                          <span>as</span>
                          <app-combo [options]="groupOptions()" [value]="kw()!.group" ariaLabel="Group" (changed)="kw.set({ ...kw()!, group: $event })" />
                          <div class="row"><button type="button" class="ghost" (click)="kw.set(null)">Cancel</button><button class="primary" [disabled]="!kw()!.group">Save rule</button></div>
                        </div>
                      </form>
                    }
                  </td>
                  <td class="num strong" [class.pos]="r.type === 'Income'">{{ amount(r) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (sel().size) {
          <div class="savebar">
            <span class="muted">{{ sel().size }} selected</span>
            <app-combo [options]="groupOptions()" [(value)]="bulkGroup" placeholder="Group" ariaLabel="Bulk group" />
            <button class="primary" [disabled]="!bulkGroup()" (click)="apply([...sel()], bulkGroup()!)">Apply to {{ sel().size }}</button>
          </div>
        }
      }
    }
  `,
  styles: `
    .seg { margin-bottom: var(--sp-4); }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); }
    .rec { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-1) var(--sp-3); margin: 0; }
    .rec dt { color: var(--muted); }
    .rec dd { margin: 0; overflow-wrap: anywhere; }
    .sm { font-size: var(--fs-xs); }
    .gcell { position: relative; white-space: nowrap; }
    .popover { white-space: normal; min-width: 18rem; }
    .pform { display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-sm); }
    .pform .row { display: flex; justify-content: flex-end; gap: var(--sp-2); }
    @media (max-width: 640px) { .pair { grid-template-columns: 1fr; } }
  `,
})
export class Inbox {
  private api = inject(Api);
  private toast = inject(Toast);
  private refresh = inject(Refresh);
  protected fmt = fmt;
  protected amount = amount;
  protected daysApart = daysApart;
  protected day = dayLabel;
  protected color = groupColor;
  protected hollow = (g: string) => HOLLOW.has(g);
  protected diff = (a: Row, b: Row) => Math.abs(Math.abs(a.amountCents) - Math.abs(b.amountCents));

  protected tab = signal<'dups' | 'unc'>('dups');
  protected sel = signal<Set<number>>(new Set());
  protected bulkGroup = signal<string | null>(null);
  protected kw = signal<{ id: number; keyword: string; group: string } | null>(null);

  protected meta = resource({ params: () => this.refresh.tick(), loader: () => this.api.meta() });
  protected dups = resource({ params: () => this.refresh.tick(), loader: () => this.api.possibleDuplicates() });
  protected unc = resource({ params: () => this.refresh.tick(), loader: () => this.api.unclassified() });

  protected groupOptions = computed<ComboOption[]>(() =>
    (this.meta.value()?.groups ?? []).map((g) => ({ value: g, label: g, ...groupDot(g) })));
  protected allSelected = computed(() => !!this.unc.value()?.length && this.sel().size === this.unc.value()!.length);

  constructor() {
    // Drop selections and popovers for rows that no longer exist after a reload.
    effect(() => {
      const ids = new Set((this.unc.value() ?? []).map((r) => r.id));
      this.sel.update((s) => new Set([...s].filter((id) => ids.has(id))));
      if (this.kw() && !ids.has(this.kw()!.id)) this.kw.set(null);
    });
  }

  protected toggle(id: number) {
    this.sel.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  protected toggleAll() {
    this.sel.set(this.allSelected() ? new Set() : new Set((this.unc.value() ?? []).map((r) => r.id)));
  }

  private async run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
    } catch (e) {
      this.toast.show(errMsg(e), 'err');
      return false;
    }
    this.toast.show(ok);
    this.refresh.tick.update((n) => n + 1);
    return true;
  }

  protected decide(a: Row, b: Row, decision: 'dup' | 'not') {
    return this.run(() => this.api.decideDuplicate(a.id, b.id, decision), decision === 'dup' ? 'Marked as same payment' : 'Marked as different');
  }

  protected async apply(ids: number[], group: string) {
    if (await this.run(() => this.api.bulkGroup(ids, group), `${ids.length} moved to ${group}`)) this.bulkGroup.set(null);
  }

  protected async addKeyword(e: Event) {
    e.preventDefault();
    const keyword = String(new FormData(e.target as HTMLFormElement).get('keyword')).trim();
    const group = this.kw()!.group;
    if (await this.run(() => this.api.addKeyword(keyword, group), `Rule saved: "${keyword}" → ${group}`)) this.kw.set(null);
  }
}
