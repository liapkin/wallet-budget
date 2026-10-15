import type { Config, Rec } from './types.ts';

export function classify(rec: Rec, cfg: Config): string {
  if (rec.groupOverride) return rec.groupOverride;
  const note = rec.note.toLowerCase();
  const hits = cfg.wallet.merchantKeywords.filter((k) => note.includes(k.keyword.toLowerCase()));
  // non-spending keywords win over Income so own-account transfers are not counted as income
  const skip = hits.find((k) => cfg.wallet.excludedGroups.includes(k.group));
  if (skip) return skip.group;
  const map = cfg.wallet.categoryMap;
  const byCat = (name?: string | null) => map.find((c) => c.walletCategory === name)?.group;
  if (rec.type === 'Income') {
    if (hits[0]) return hits[0].group;
    // only excluded groups (e.g. Transfer) may come from the category map; other income stays Income
    const g = byCat(rec.category) ?? byCat(rec.parentCategory);
    return g && cfg.wallet.excludedGroups.includes(g) ? g : 'Income';
  }
  const spend = hits.find((k) => !cfg.wallet.incomeGroups.includes(k.group));
  if (spend) return spend.group;
  return byCat(rec.category) ?? byCat(rec.parentCategory) ?? 'Other';
}
