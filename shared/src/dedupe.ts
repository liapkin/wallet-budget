import type { Rec } from './types.ts';

const DAY = 86_400_000;

// Returns Map<duplicate id, kept TRANSFER id>. One-to-one: each TRANSFER absorbs at most one MOBILE_PAYMENT.
export function dedupe(recs: Rec[]): Map<number, number> {
  const t = (r: Rec) => Date.parse(r.dateUtc);
  const mobiles = recs.filter((r) => r.paymentType === 'MOBILE_PAYMENT').sort((a, b) => t(a) - t(b));
  const transfers = recs.filter((r) => r.paymentType === 'TRANSFER').sort((a, b) => t(a) - t(b));
  const used = new Set<number>();
  const dups = new Map<number, number>();
  for (const m of mobiles) {
    const hit = transfers.find(
      (x) => !used.has(x.id) && x.amountCents === m.amountCents && t(x) >= t(m) - DAY && t(x) <= t(m) + 7 * DAY,
    );
    if (!hit) continue;
    used.add(hit.id);
    dups.set(m.id, hit.id);
  }
  return dups;
}
