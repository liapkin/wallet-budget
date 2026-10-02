import { cycleTheme, readTheme, resolveTheme, setTheme, theme, themeLabel } from './theme';
import { vi } from 'vitest';

describe('theme', () => {
  afterEach(() => setTheme('light'));

  it('has only explicit states and persists clicks', () => {
    setTheme('dark');
    expect(theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(themeLabel('dark')).toContain('Switch to Light');

    cycleTheme();
    expect(theme()).toBe('light');
  });

  it('keeps session theme when storage write fails', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      setTheme('dark');
      expect(theme()).toBe('dark');
      expect(document.documentElement.dataset['theme']).toBe('dark');
    } finally { write.mockRestore(); }
  });

  it('resolves unset and legacy settings from device preference', () => {
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('broken', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(readTheme(() => { throw new Error('blocked'); }, true)).toBe('dark');
  });
});
