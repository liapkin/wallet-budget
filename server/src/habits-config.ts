export function habitsConfigError(habits: unknown): string | undefined {
  if (habits === undefined) return;
  if (!Array.isArray(habits)) return 'habits must be an array';
  const ids = new Set<string>();
  for (const h of habits) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) return 'habits entries must be objects';
    for (const key of ['id', 'name'])
      if (typeof h[key] !== 'string' || !h[key].trim()) return `habit ${key} must be nonempty`;
    if (ids.has(h.id)) return `habit id ${h.id} is duplicated`;
    ids.add(h.id);
    if (h.time !== undefined && (typeof h.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.time))) return 'habit time must be HH:MM';
    if (h.note !== undefined && typeof h.note !== 'string') return 'habit note must be a string';
  }
}
