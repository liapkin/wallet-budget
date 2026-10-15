import { vi } from 'vitest';
import { checkKeys, loadChecks, pruneChecks, resetChecks, saveChecks, toggleCheck } from './checklist';

const DAY = 24 * 60 * 60 * 1000;

describe('checklist', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('toggles on and off without mutating', () => {
    const a = toggleCheck({}, 'k', 5);
    expect(a).toEqual({ k: 5 });
    expect(toggleCheck(a, 'k', 9)).toEqual({});
    expect(a).toEqual({ k: 5 });
  });

  it('drops entries older than 24h on load', () => {
    saveChecks({ old: 1000, fresh: 1000 + DAY });
    expect(loadChecks(1000 + DAY + 1)).toEqual({ fresh: 1000 + DAY });
  });

  it('prunes keys that no longer exist', () => {
    const [before] = checkKeys('weekly', [{ where: 'A', item: 'Milk' }]);
    const [after] = checkKeys('weekly', [{ where: 'A', item: 'Oat milk' }]);
    expect(pruneChecks({ [before]: 1 }, new Set([after]))).toEqual({});
    expect(pruneChecks({ [before]: 1 }, new Set([before]))).toEqual({ [before]: 1 });
  });

  it('reset clears storage', () => {
    saveChecks({ k: 1 });
    resetChecks();
    expect(loadChecks(2)).toEqual({});
  });

  it('gives duplicates distinct keys', () => {
    const keys = checkKeys('weekly', [{ where: 'A', item: 'Egg' }, { where: 'A', item: 'Egg' }, { where: 'B', item: 'Egg' }]);
    expect(new Set(keys).size).toBe(3);
  });

  it('survives throwing storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadChecks(1)).toEqual({});
    expect(() => saveChecks({ k: 1 })).not.toThrow();
    expect(() => resetChecks()).not.toThrow();
  });
});
