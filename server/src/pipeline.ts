import { db, getConfig } from './db.ts';
import { dedupe } from '../../shared/src/dedupe.ts';
import { classify } from '../../shared/src/classify.ts';
import { athensMonth } from '../../shared/src/month.ts';
import { summarize, type Summary } from '../../shared/src/summary.ts';
import type { Rec } from '../../shared/src/types.ts';

export const activeSource = (): 'api' | 'import' => (db.prepare("SELECT 1 FROM records WHERE source='api'").get() ? 'api' : 'import');

export function runPipeline(): void {
  const cfg = getConfig();
  const active = activeSource();
  const inactive = active === 'api' ? 'import' : 'api';
  const recs = (db.prepare('SELECT * FROM records').all() as Record<string, any>[]).map((r): Rec => ({
    id: r.id, source: r.source, account: r.account, category: r.category, amountCents: r.amount_cents, type: r.type,
    paymentType: r.payment_type, note: r.note, dateUtc: r.date_utc, groupOverride: r.group_override,
  }));
  // the inactive source must not pair with the active one
  const dups = dedupe(recs.filter((r) => r.source !== inactive));
  const upd = db.prepare('UPDATE records SET is_dup=?, dup_of=?, grp=?, month=? WHERE id=?');
  db.exec('BEGIN');
  try {
    for (const r of recs) upd.run(dups.has(r.id) ? 1 : 0, dups.get(r.id) ?? null, classify(r, cfg), athensMonth(r.dateUtc), r.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function spendSummary(): Summary {
  const rows = db
    .prepare(
      "SELECT month, grp, amount_cents AS amountCents FROM records WHERE is_dup=0 AND source IN (?, 'manual') AND type='Expenses'",
    )
    .all(activeSource()) as { month: string; grp: string; amountCents: number }[];
  return summarize(rows.map((r) => ({ ...r, isDup: false })));
}
