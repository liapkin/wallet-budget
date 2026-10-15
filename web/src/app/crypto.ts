import { Component, computed, inject, resource, signal, type WritableSignal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { CryptoCoin } from '../../../shared/src/crypto.ts';
import { currencySymbol, fmt } from './format';
import { Api } from './api';
import { ChartView } from './ui/chart';
import { configDraft, editDraft } from './ui/config-draft';
import { Refresh } from './ui/refresh';
import { Toast } from './ui/toast';

@Component({
  selector: 'app-crypto',
  imports: [ChartView],
  host: { '(window:keydown)': 'key($event)' },
  styles: `
    .total { font-size: var(--fs-xl, 2rem); font-weight: 600; }
    .coin { display: grid; grid-template-columns: 6rem 1fr 1fr 1fr auto; gap: var(--sp-2); margin-bottom: var(--sp-2); }
    .affix { display: flex; }
    .affix input { flex: 1; width: auto; }
    @media (max-width: 640px) { .coin { grid-template-columns: 1fr 1fr; } }
  `,
  template: `
    <div class="page-head"><h1>{{ route.title }}</h1></div>
    @if (data.error()) {
      <p class="err">Failed to load holdings.</p>
    } @else if (!data.value()) {
      <div class="card"><div class="skeleton" style="height: 240px"></div></div>
    } @else {
      <div>
        <div class="total">{{ fmt(s().totals.valueCents) }}</div>
        <span [style.color]="tone(s().totals.pct24h)">{{ pct(s().totals.pct24h) }} 24h</span>
        @if (updated()) { <span class="muted"> {{ updated() }}</span> }
      </div>

      <section class="card">
        <div class="card-head"><h2>Allocation</h2></div>
        @if (s().totals.valueCents > 0) {
          <app-chart [option]="pie()" [height]="300" />
        } @else {
          <p class="muted">No priced holdings yet.</p>
        }
      </section>

      <div class="kpis">
        <div class="kpi"><div class="label">All-time profit</div><div class="value" [style.color]="tone(s().totals.profitCents)">{{ fmt(s().totals.profitCents) }} <small>{{ pct(s().totals.profitPct) }}</small></div></div>
        <div class="kpi"><div class="label">Cost basis</div><div class="value">{{ fmt(s().totals.paidCents) }}</div></div>
        <div class="kpi"><div class="label">Best performer</div>@if (s().best; as c) { <div class="value" [style.color]="tone(c.profitCents)">{{ c.symbol }} <small>{{ fmt(c.profitCents!) }} {{ pct(c.profitPct) }}</small></div> } @else { <div class="value">–</div> }</div>
        <div class="kpi"><div class="label">Worst performer</div>@if (s().worst; as c) { <div class="value" [style.color]="tone(c.profitCents)">{{ c.symbol }} <small>{{ fmt(c.profitCents!) }} {{ pct(c.profitPct) }}</small></div> } @else { <div class="value">–</div> }</div>
      </div>

      @if (s().tags.length > 1) {
        <p class="muted">
          @for (t of s().tags; track t.tag) {
            <span class="nowrap">{{ t.tag }} {{ fmt(t.valueCents) }} <span [style.color]="tone(t.profitCents)">{{ pct(t.profitPct) }}</span>&nbsp;&nbsp;</span>
          }
        </p>
      }

      <div class="scroll">
        <table>
          <thead>
            <tr><th>Holding</th><th>Tag</th><th class="num">Amount</th><th class="num">Price</th><th class="num">24h</th><th class="num">Value</th><th class="num">Paid</th><th class="num">Profit</th><th class="num">Allocation</th></tr>
          </thead>
          <tbody>
            @for (c of s().coins; track $index) {
              <tr>
                <td class="strong">{{ c.symbol }}</td>
                <td>{{ c.tag }}</td>
                <td class="num">{{ c.amount }}</td>
                <td class="num">{{ money(c.priceCents) }}</td>
                <td class="num" [style.color]="tone(c.pct24h)">{{ pct(c.pct24h) }}</td>
                <td class="num">{{ money(c.valueCents) }}</td>
                <td class="num">{{ fmt(c.paidCents) }}</td>
                <td class="num" [style.color]="tone(c.profitCents)">{{ profit(c) }}</td>
                <td class="num">{{ pct(c.allocationPct, false) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="muted">No holdings yet.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <p>
        <button class="ghost" (click)="editing.set(!editing())">{{ editing() ? 'Done editing' : 'Edit holdings' }}</button>
        <button class="ghost" (click)="refreshPrices()" [disabled]="refreshing()">{{ refreshing() ? 'Refreshing…' : 'Refresh prices' }}</button>
        @if (route.import) { <button class="ghost" (click)="importing.set(!importing())">Import from CoinMarketCap</button> }
      </p>
      @if (importing()) {
        <section class="card">
          <h2>Import from CoinMarketCap</h2>
          <label class="field">Overview CSV<input type="file" accept=".csv" (change)="pick(overview, $event)" /></label>
          <label class="field">Transactions CSV<input type="file" accept=".csv" (change)="pick(transactions, $event)" /></label>
          <label class="field">Tag<input type="text" [value]="tag()" (change)="tag.set($any($event.target).value)" /></label>
          <p><button class="primary" (click)="importCsv()" [disabled]="!overview() || !transactions() || busy()">{{ busy() ? 'Importing…' : 'Import' }}</button></p>
          <p class="muted">Export Overview and Transactions from CMC Portfolio, then import both.</p>
        </section>
      }
      @if (editing() && draft(); as c) {
        <section class="card">
          <h2>Edit holdings</h2>
          @for (h of c.investing[route.configKey]; track $index; let i = $index) {
            <div class="coin">
              <input type="text" [value]="h.symbol" [placeholder]="route.kind === 'etf' ? 'Yahoo ticker, e.g. VWCE.DE' : 'Symbol'" (change)="setSymbol(i, $event)" />
              <input type="text" [value]="h.tag ?? ''" placeholder="Tag" (change)="setTag(i, $event)" />
              <input type="text" inputmode="decimal" [value]="h.amount" placeholder="Amount" (change)="setAmount(i, $event)" />
              <span class="affix" [attr.data-pre]="currencySymbol()"><input type="text" inputmode="decimal" [value]="unitPrice(h)" placeholder="Avg buy price per unit" (change)="setPrice(i, $event)" /></span>
              <button class="ghost danger" (click)="remove(i)">Remove</button>
            </div>
          }
          <p><button class="link" (click)="add()">+ Add holding</button></p>
          <p class="muted">{{ route.kind === 'etf' ? 'Prices refresh on each sync (Yahoo Finance, converted to EUR).' : 'Prices refresh on each sync (CoinMarketCap, EUR).' }}</p>
          <p class="muted">Amount is the number of units; avg buy price is per unit in EUR. Cost basis = amount × price.</p>
        </section>
      }
      @if (dirty()) {
        <div class="savebar" role="status">
          <span class="muted grow">Unsaved changes</span>
          <button class="ghost" (click)="discard()" [disabled]="saving()">Discard</button>
          <button class="primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      }
    }
  `,
})
export class CryptoComponent {
  protected route = inject(ActivatedRoute).snapshot.data as { kind: 'crypto' | 'etf'; title: string; configKey: 'crypto' | 'etfs'; import: boolean };
  protected fmt = fmt;
  protected currencySymbol = currencySymbol;
  private api = inject(Api);
  private tick = inject(Refresh).tick;
  protected data = resource({ params: () => this.tick(), loader: () => this.api.holdings(this.route.kind) });
  private cd = configDraft('Holdings saved', () => this.data.reload());
  protected draft = this.cd.draft;
  protected saving = this.cd.saving;
  protected dirty = this.cd.dirty;
  protected discard = this.cd.discard;
  protected save = this.cd.save;

  protected editing = signal(false);
  protected importing = signal(false);
  protected tag = signal('Main');
  protected overview = signal<File | null>(null);
  protected transactions = signal<File | null>(null);
  protected busy = signal(false);
  protected refreshing = signal(false);
  private toast = inject(Toast);
  private now = signal(Date.now());

  protected s = computed(() => this.data.value()!.summary);
  protected updated = computed(() => {
    const t = this.data.value()?.updatedAt;
    if (!t) return '';
    const min = Math.max(0, Math.floor((this.now() - new Date(t).getTime()) / 60000));
    return min < 1 ? 'Updated just now' : min < 60 ? `Updated ${min} min ago` : min < 1440 ? `Updated ${Math.floor(min / 60)} h ago` : `Updated ${Math.floor(min / 1440)} d ago`;
  });

  protected tone = (n: number | null | undefined) => (n == null || n === 0 ? null : n > 0 ? 'var(--good)' : 'var(--bad)');
  protected pct = (n: number | null, sign = true) => (n === null ? '–' : `${sign && n > 0 ? '+' : ''}${n.toFixed(2)}%`);
  protected money = (c: number | null) => (c === null ? '–' : fmt(c));
  protected profit = (c: CryptoCoin) => (c.profitCents === null ? '–' : `${fmt(c.profitCents)} ${this.pct(c.profitPct)}`);
  protected unitPrice = (h: { amount: number; paid: number }) => (h.amount > 0 ? String(+(h.paid / h.amount / 100).toFixed(6)) : '');

  protected pie = computed(() => {
    const coins = this.s().coins.filter((c) => c.valueCents);
    const total = coins.reduce((s, c) => s + c.valueCents!, 0);
    // labels on tiny slices pile up; the table lists them anyway
    const data = coins.map((c) => {
      const show = c.valueCents! / total >= 0.03;
      return { name: c.symbol, value: c.valueCents, label: { show }, labelLine: { show } };
    });
    return {
      tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: ${fmt(p.value)} (${p.percent}%)` },
      series: [{
        type: 'pie', radius: ['45%', '70%'], data,
        label: { formatter: '{b}  {d}%' },
      }],
    };
  });

  protected add() {
    editDraft(this.draft, (c) => c.investing[this.route.configKey].push({ symbol: '', amount: 0, paid: 0 }));
  }
  protected remove(i: number) {
    editDraft(this.draft, (c) => c.investing[this.route.configKey].splice(i, 1));
  }
  protected setSymbol(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    el.value = el.value.trim().toUpperCase();
    editDraft(this.draft, (c) => (c.investing[this.route.configKey][i].symbol = el.value));
  }
  protected setTag(i: number, e: Event) {
    const tag = (e.target as HTMLInputElement).value.trim();
    editDraft(this.draft, (c) => (c.investing[this.route.configKey][i].tag = tag || undefined));
  }
  protected setAmount(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    const amount = Number(el.value);
    if (!el.value.trim() || !Number.isFinite(amount) || amount < 0) {
      el.value = String(this.draft()!.investing[this.route.configKey][i].amount);
      return;
    }
    editDraft(this.draft, (c) => {
      const h = c.investing[this.route.configKey][i];
      if (h.amount > 0) h.paid = Math.round((h.paid / h.amount) * amount);
      h.amount = amount;
    });
  }
  protected setPrice(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    const h = this.draft()!.investing[this.route.configKey][i];
    const unit = Number(el.value.replace(',', '.'));
    if (!el.value.trim() || !Number.isFinite(unit) || unit < 0) {
      el.value = this.unitPrice(h);
      return;
    }
    editDraft(this.draft, (c) => (c.investing[this.route.configKey][i].paid = Math.round(unit * h.amount * 100)));
  }

  protected pick(file: WritableSignal<File | null>, e: Event) {
    file.set((e.target as HTMLInputElement).files?.[0] ?? null);
  }
  protected async refreshPrices() {
    this.refreshing.set(true);
    try {
      await this.api.refreshHoldings(this.route.kind);
      this.data.reload();
      this.toast.show('Prices updated');
    } catch (e: any) {
      this.toast.show(e?.error?.error ?? 'Refresh failed', 'err');
    } finally {
      this.refreshing.set(false);
    }
  }

  protected async importCsv() {
    const tag = this.tag().trim() || 'Main';
    if (!confirm(`Replaces holdings tagged ${tag}`)) return;
    this.busy.set(true);
    try {
      const [overview, transactions] = await Promise.all([this.overview()!.text(), this.transactions()!.text()]);
      await this.api.importCrypto({ overview, transactions, tag });
      this.data.reload();
      this.importing.set(false);
      this.toast.show('Holdings imported');
    } catch (e: any) {
      this.toast.show(e?.error?.error ?? 'Import failed', 'err');
    } finally {
      this.busy.set(false);
    }
  }

  protected key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void this.save();
    }
  }
}
