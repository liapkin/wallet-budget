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
  return cfg.wallet.categoryMap.find((c) => c.walletCategory === rec.category)?.group ?? 'Other';
}
