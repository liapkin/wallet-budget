import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Config, Currency } from '../../../shared/src/types.ts';
import type { Summary } from '../../../shared/src/summary.ts';

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
export type MonthClose = { transfers: { key: string; label: string; from: string; to: string; cents: number }[]; done: string[] };
export type Unclassified = Row & { suggestion: { group: string; confidence: number } | null };
export type Account = { id: string; name: string; balanceCents: number | null; currency: string; updatedAt: string };
export type Actuals = Record<string, Record<string, number>>;
export type WalletCategory = { id: string; name: string; parent: string };
export type NewRecord = {
  date: string; amount: string; note: string; type: string; account: string;
  toWallet?: boolean; accountId?: string; categoryId?: string;
};

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  summary = () => firstValueFrom(this.http.get<{ spend: Summary; income: Record<string, number> }>('/api/summary'));
  meta = () => firstValueFrom(this.http.get<Meta>('/api/meta'));
  records = (params: Record<string, string>) => firstValueFrom(this.http.get<Row[]>('/api/records', { params }));
  addRecord = (r: NewRecord) => firstValueFrom(this.http.post<Row>('/api/records', r));
  deleteRecord = (id: number, wallet = false) =>
    firstValueFrom(this.http.delete<void>(`/api/records/${id}`, wallet ? { params: { wallet: 1 } } : {}));
  possibleDuplicates = () => firstValueFrom(this.http.get<{ a: Row; b: Row }[]>('/api/possible-duplicates'));
  decideDuplicate = (a: number, b: number, decision: 'dup' | 'not') =>
    firstValueFrom(this.http.post<void>('/api/possible-duplicates', { a, b, decision }));
  unclassified = () => firstValueFrom(this.http.get<Unclassified[]>('/api/unclassified'));
  bulkGroup = (ids: number[], group: string) => firstValueFrom(this.http.post<void>('/api/records/bulk-group', { ids, group }));
  monthClose = (month: string) => firstValueFrom(this.http.get<MonthClose>(`/api/month-close/${month}`));
  setMonthClose = (month: string, done: string[]) => firstValueFrom(this.http.put<{ done: string[] }>(`/api/month-close/${month}`, { done }));
  setGroup = (id: number, groupOverride: string | null) =>
    firstValueFrom(this.http.patch<Row>(`/api/records/${id}`, { groupOverride }));
  addKeyword = (keyword: string, group: string) => firstValueFrom(this.http.post('/api/keywords', { keyword, group }));
  config = () => firstValueFrom(this.http.get<Config>('/api/config'));
  saveConfig = (c: Config) => firstValueFrom(this.http.put<Config>('/api/config', c));
  accounts = () => firstValueFrom(this.http.get<Account[]>('/api/accounts'));
  walletCategories = () => firstValueFrom(this.http.get<WalletCategory[]>('/api/wallet-categories'));
  actuals = () => firstValueFrom(this.http.get<Actuals>('/api/actuals'));
  setActual = (month: string, key: string, cents: number | null) =>
    firstValueFrom(this.http.put<void>(`/api/actuals/${month}`, { [key]: cents }));
  sync = () => firstValueFrom(this.http.post<{ inserted: number }>('/api/sync', {}));
}
