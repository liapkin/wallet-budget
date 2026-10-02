import type { Config, Rec } from './types.ts';

export function classify(rec: Rec, cfg: Config): string {
  if (rec.groupOverride) return rec.groupOverride;
  const note = rec.note.toLowerCase();
  const hits = cfg.wallet.merchantKeywords.filter((k) => note.includes(k.keyword.toLowerCase()));
  // non-spending keywords win over Income so own-account transfers are not counted as income
  const skip = hits.find((k) => cfg.wallet.excludedGroups.includes(k.group));
  if (skip) return skip.group;
  if (rec.type === 'Income') return 'Income';
  if (hits[0]) return hits[0].group;
  const map = cfg.wallet.categoryMap;
  const byCat = (name?: string | null) => map.find((c) => c.walletCategory === name)?.group;
  return byCat(rec.category) ?? byCat(rec.parentCategory) ?? 'Other';
}
