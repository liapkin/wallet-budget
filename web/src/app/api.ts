import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { finalize, firstValueFrom, type Observable } from 'rxjs';
import type { Config, Currency } from '../../../shared/src/types.ts';
import type { CryptoSummary } from '../../../shared/src/crypto.ts';
import type { Summary } from '../../../shared/src/summary.ts';
import type { SyncJob } from '../../../shared/src/sync-job.ts';

export type Row = {
  id: number;
  source: 'import' | 'api' | 'manual';
  account: string;
  category: string;
  amountCents: number;
  type: 'Expenses' | 'Income';
  paymentType: string;
  note: string;
  dateUtc: string;
  groupOverride: string | null;
  isDup: boolean;
  dupOf: number | null;
  grp: string;
  month: string;
  createdInApp?: boolean;
};
export type Meta = {
  groups: string[]; excludedGroups: string[]; accounts: string[]; months: string[]; demo?: boolean; lastSync?: string | null;
  currency?: Currency; currencyLocked?: boolean;
};
export type MonthClose = { transfers: { key: string; label: string; from: string; to: string; cents: number; gap?: number }[]; done: string[] };
export type Unclassified = Row & { suggestion: { group: string; confidence: number } | null };
export type Account = { id: string; name: string; balanceCents: number | null; currency: string; updatedAt: string };
export type Actuals = Record<string, Record<string, number>>;
export type WalletCategory = { id: string; name: string; parent: string };
export type NewRecord = {
  date: string; amount: string; note: string; type: string; account: string;
  toWallet?: boolean; accountId?: string; categoryId?: string;
};

export type CryptoData = { summary: CryptoSummary; history: { ts: string; cents: number }[]; updatedAt: string | null };

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private cache = new Map<string, { at: number; p: Promise<unknown> }>();

  /** Shares in-flight/recent (60s) GETs for config, accounts and meta; any write drops them. */
  private cached<T>(url: string): Promise<T> {
    const hit = this.cache.get(url);
    if (hit && Date.now() - hit.at < 60_000) return hit.p.then((v) => structuredClone(v) as T);
    const p = firstValueFrom(this.http.get<T>(url));
    const entry = { at: Date.now(), p };
    this.cache.set(url, entry);
    p.catch(() => this.cache.get(url) === entry && this.cache.delete(url));
    return p.then((v) => structuredClone(v));
  }

  clearCache = () => this.cache.clear();

  private write<T>(req: Observable<T>): Promise<T> {
    this.cache.clear();
    return firstValueFrom(req.pipe(finalize(() => this.cache.clear())));
  }

  summary = () => firstValueFrom(this.http.get<{ spend: Summary; income: Record<string, number> }>('/api/summary'));
  meta = () => this.cached<Meta>('/api/meta');
  records = (params: Record<string, string>) => firstValueFrom(this.http.get<Row[]>('/api/records', { params }));
  addRecord = (r: NewRecord) => this.write(this.http.post<Row>('/api/records', r));
  deleteRecord = (id: number, wallet = false) =>
    this.write(this.http.delete<void>(`/api/records/${id}`, wallet ? { params: { wallet: 1 } } : {}));
  possibleDuplicates = () => firstValueFrom(this.http.get<{ a: Row; b: Row }[]>('/api/possible-duplicates'));
  decideDuplicate = (a: number, b: number, decision: 'dup' | 'not') =>
    this.write(this.http.post<void>('/api/possible-duplicates', { a, b, decision }));
  cashTopups = () => firstValueFrom(this.http.get<{ cashAccountId: string | null; items: Row[] }>('/api/cash-topups'));
  cashTopUp = (id: number) => this.write(this.http.post<Row>(`/api/cash-topups/${id}`, {}));
  unclassified = () => firstValueFrom(this.http.get<Unclassified[]>('/api/unclassified'));
  bulkGroup = (ids: number[], group: string) => this.write(this.http.post<void>('/api/records/bulk-group', { ids, group }));
  monthClose = (month: string) => firstValueFrom(this.http.get<MonthClose>(`/api/month-close/${month}`));
  setMonthClose = (month: string, done: string[]) => this.write(this.http.put<{ done: string[] }>(`/api/month-close/${month}`, { done }));
  setGroup = (id: number, groupOverride: string | null) =>
    this.write(this.http.patch<Row>(`/api/records/${id}`, { groupOverride }));
  addKeyword = (keyword: string, group: string) => this.write(this.http.post('/api/keywords', { keyword, group }));
  config = () => this.cached<Config>('/api/config');
  saveConfig = (c: Config) => this.write(this.http.put<Config>('/api/config', c));
  accounts = () => this.cached<Account[]>('/api/accounts');
  walletCategories = () => firstValueFrom(this.http.get<WalletCategory[]>('/api/wallet-categories'));
  actuals = () => firstValueFrom(this.http.get<Actuals>('/api/actuals'));
  setActual = (month: string, key: string, cents: number | null) =>
    this.write(this.http.put<void>(`/api/actuals/${month}`, { [key]: cents }));
  holdings = (kind: 'crypto' | 'etf') => firstValueFrom(this.http.get<CryptoData>(`/api/holdings/${kind}`));
  refreshHoldings = (kind: 'crypto' | 'etf') => this.write(this.http.post<CryptoData>(`/api/holdings/${kind}/refresh`, {}));
  importCrypto = (body: { overview: string; transactions: string; tag: string }) =>
    this.write(this.http.post<CryptoData>('/api/crypto/import', body));
  habitLog = (from: string, to: string) => firstValueFrom(this.http.get<{ day: string; habit: string }[]>('/api/habits', { params: { from, to } }));
  setHabit = (day: string, habit: string, done: boolean) =>
    firstValueFrom(done ? this.http.put<void>(`/api/habits/${day}/${habit}`, {}) : this.http.delete<void>(`/api/habits/${day}/${habit}`));
  pushKey = () => firstValueFrom(this.http.get<{ key: string | null }>('/api/push/key'));
  pushSubscribe = (sub: PushSubscriptionJSON) => firstValueFrom(this.http.post<void>('/api/push/subscribe', sub));
  pushUnsubscribe = (endpoint: string) => firstValueFrom(this.http.delete<void>('/api/push/subscribe', { body: { endpoint } }));
  sync = () => this.write(this.http.post<SyncJob>('/api/sync', {}));
  syncStatus = () => firstValueFrom(this.http.get<SyncJob>('/api/sync'));
}
