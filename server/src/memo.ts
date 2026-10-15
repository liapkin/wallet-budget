// Read cache for hot queries. Any DB write (see db.ts) bumps the version and drops everything.
// Cached values are shared between callers: treat them as immutable.
const MAX = 64;
const cache = new Map<string, unknown>();
let version = 0;

export const bumpVersion = (): void => {
  version++;
  cache.clear();
};

export function memo<T>(key: string, compute: () => T): T {
  if (cache.has(key)) {
    const hit = cache.get(key) as T;
    cache.delete(key); // refresh recency
    cache.set(key, hit);
    return hit;
  }
  const v = version;
  const value = compute();
  if (v !== version) return value; // a write happened while computing
  if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}
