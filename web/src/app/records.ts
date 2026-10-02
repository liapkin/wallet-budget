import { Component, computed, inject, resource, signal } from '@angular/core';
import { fmt } from '../../../shared/src/money.ts';
import { Api, type Row } from './api';

const athensNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Athens' }).slice(0, 16).replace(' ', 'T');
const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

@Component({
  selector: 'app-records',
  template: `
    <h1>Records</h1>
    <form class="toolbar" (submit)="add($event)">
      <input type="datetime-local" name="date" [value]="now" required />
      <input name="amount" inputmode="decimal" placeholder="Amount €" size="8" required />
      <input name="note" placeholder="Note" />
      <select name="type">
        <option>Expenses</option>
        <option>Income</option>
      </select>
      <input name="account" value="Manual" size="10" />
      <button class="primary">Add</button>
    </form>
    @if (error()) {
      <p class="err">{{ error() }}</p>
    }

    <div class="toolbar">
      <select (change)="month.set(val($event))" aria-label="Month">
        <option value="">All months</option>
        @for (m of meta.value()?.months ?? []; track m) {
          <option [value]="m" [selected]="m === month()">{{ m }}</option>
        }
      </select>
      <select (change)="group.set(val($event))" aria-label="Group">
        <option value="" [selected]="!group()">All groups</option>
        @for (g of meta.value()?.groups ?? []; track g) {
          <option [selected]="g === group()">{{ g }}</option>
        }
      </select>
      <select (change)="account.set(val($event))" aria-label="Account">
        <option value="">All accounts</option>
        @for (a of meta.value()?.accounts ?? []; track a) {
          <option [selected]="a === account()">{{ a }}</option>
        }
      </select>
      <button [class.on]="group() === 'Other'" (click)="group.set(group() === 'Other' ? '' : 'Other')">Other only</button>
      <span class="muted">{{ rows.value()?.length ?? 0 }} rows</span>
    </div>

    <div class="scroll tall">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Note</th>
            <th>Wallet category</th>
            <th class="num">Amount</th>
            <th>Group</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows.value() ?? []; track r.id) {
            <tr [class.dim]="r.isDup">
              <td class="nowrap">{{ date(r.dateUtc) }}</td>
              <td>{{ r.account }}</td>
              <td>
                {{ r.note }}
                @if (r.isDup) {
                  <span class="badge" [title]="'duplicate of #' + r.dupOf">dup</span>
                }
              </td>
              <td class="muted">{{ r.category }}</td>
              <td class="num" [class.pos]="r.amountCents > 0">{{ fmt(r.amountCents) }}</td>
              <td class="nowrap">
                <select (change)="setGroup(r, val($event))" aria-label="Group override">
                  <option value="" [selected]="!r.groupOverride">auto: {{ r.grp }}</option>
                  @for (g of meta.value()?.groups ?? []; track g) {
                    <option [selected]="g === r.groupOverride">{{ g }}</option>
                  }
                </select>
                <button class="link" (click)="kw.set({ id: r.id, keyword: r.note, group: r.grp })">+ keyword</button>
                @if (r.source === 'manual') {
                  <button class="link danger" (click)="remove(r)">delete</button>
                }
              </td>
            </tr>
            @if (kw()?.id === r.id) {
              <tr>
                <td colspan="7">
                  <form class="toolbar" (submit)="addKeyword($event)">
                    <input name="keyword" [value]="kw()!.keyword" placeholder="Keyword" required />
                    <select name="group">
                      @for (g of meta.value()?.groups ?? []; track g) {
                        <option [selected]="g === kw()!.group">{{ g }}</option>
                      }
                    </select>
                    <button class="primary">Save keyword</button>
                    <button type="button" (click)="kw.set(null)">Cancel</button>
                  </form>
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  `,
})
export class Records {
  private api = inject(Api);
  protected fmt = fmt;
  protected val = val;
  protected now = athensNow();
  protected month = signal('');
  protected group = signal('');
  protected account = signal('');
  protected error = signal('');
  protected kw = signal<{ id: number; keyword: string; group: string } | null>(null);
  protected meta = resource({ loader: () => this.api.meta() });

  protected rows = resource({
    params: computed(() => ({ month: this.month(), group: this.group(), account: this.account() })),
    loader: ({ params }) => this.api.records(params),
  });

  constructor() {
    this.api.meta().then((m) => this.month.set(m.months[0] ?? ''));
  }

  protected date = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' });

  private async run(fn: () => Promise<unknown>) {
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Request failed');
      return;
    }
    this.rows.reload();
    this.meta.reload();
  }

  protected add(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    return this.run(async () => {
      await this.api.addRecord({ date: f['date'], amount: f['amount'], note: f['note'], type: f['type'], account: f['account'] });
      form.reset();
    });
  }

  protected setGroup = (r: Row, g: string) => this.run(() => this.api.setGroup(r.id, g || null));
  protected remove = (r: Row) => this.run(() => this.api.deleteRecord(r.id));

  protected addKeyword(e: Event) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    return this.run(async () => {
      await this.api.addKeyword(String(f.get('keyword')), String(f.get('group')));
      this.kw.set(null);
    });
  }
}
