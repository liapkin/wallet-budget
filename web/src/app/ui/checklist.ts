const KEY = 'grocery-checks';
const DAY = 24 * 60 * 60 * 1000;

export type Checks = Record<string, number>;

/** One key per item; the #n suffix keeps identical rows from sharing a check. */
export function checkKeys(list: string, items: { where: string; item: string }[]): string[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const base = `${list}|${it.where}|${it.item}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

export function loadChecks(now: number): Checks {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Checks;
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => typeof t === 'number' && now - t < DAY));
  } catch {
    return {};
  }
}

export function saveChecks(map: Checks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable: checks stay in memory only
  }
}

export function toggleCheck(map: Checks, key: string, now: number): Checks {
  const { [key]: was, ...rest } = map;
  return was === undefined ? { ...map, [key]: now } : rest;
}

export function pruneChecks(map: Checks, validKeys: Set<string>): Checks {
  return Object.fromEntries(Object.entries(map).filter(([k]) => validKeys.has(k)));
}

export function resetChecks(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
