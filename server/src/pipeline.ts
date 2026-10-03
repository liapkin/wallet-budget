import { db, getConfig, tx } from './db.ts';
import { dedupe } from '../../shared/src/dedupe.ts';
import { classify } from '../../shared/src/classify.ts';
import { athensMonth } from '../../shared/src/month.ts';
import { summarize, type Summary } from '../../shared/src/summary.ts';
import type { Rec } from '../../shared/src/types.ts';

export const toRec = (r: Record<string, any>): Rec => ({
  id: r.id, source: r.source, account: r.account, category: r.category, parentCategory: r.parentCategory ?? undefined, amountCents: r.amountCents,
  type: r.type, paymentType: r.paymentType, note: r.note, dateUtc: r.dateUtc, groupOverride: r.groupOverride,
});

export const activeSource = (): 'api' | 'import' => (db.prepare("SELECT 1 FROM records WHERE source='api'").get() ? 'api' : 'import');

export function runPipeline(): void {
  const cfg = getConfig();
  const active = activeSource();
  const inactive = active === 'api' ? 'import' : 'api';
  const recs = (
    db
      .prepare(
        `SELECT id, source, account, category, amount_cents AS amountCents, type, payment_type AS paymentType, note, date_utc AS dateUtc,
           group_override AS groupOverride, json_extract(raw_json, '$.category.group.name') AS parentCategory FROM records`,
      )
      .all() as Record<string, any>[]
  ).map(toRec);
  // the inactive source must not pair with the active one
  const dups = dedupe(recs.filter((r) => r.source !== inactive));
  // confirmed duplicate pairs: keep the bank-synced record, else the later one
  const byId = new Map(recs.map((r) => [r.id, r]));
  for (const { a, b } of db.prepare("SELECT a, b FROM dup_decisions WHERE decision='dup'").all() as { a: number; b: number }[]) {
    const [x, y] = [byId.get(a), byId.get(b)];
    if (!x || !y || x.source === inactive || y.source === inactive || dups.has(a) || dups.has(b)) continue;
    const keepY = x.paymentType === y.paymentType ? y.dateUtc >= x.dateUtc : y.paymentType === 'TRANSFER';
    dups.set(keepY ? a : b, keepY ? b : a);
  }
  const upd = db.prepare('UPDATE records SET is_dup=?, dup_of=?, grp=?, month=? WHERE id=?');
  tx(() => {
    for (const r of recs) upd.run(dups.has(r.id) ? 1 : 0, dups.get(r.id) ?? null, classify(r, cfg), athensMonth(r.dateUtc), r.id);
  });
}

export function spendSummary(): Summary {
  const rows = db
    .prepare(
      "SELECT month, grp, amount_cents AS amountCents FROM records WHERE is_dup=0 AND source IN (?, 'manual') AND type='Expenses'",
    )
    .all(activeSource()) as { month: string; grp: string; amountCents: number }[];
  return summarize(rows);
}
