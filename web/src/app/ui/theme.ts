import { computed, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const NAMES = { light: 'Light', dark: 'Dark' };

export const resolveTheme = (saved: string | null, deviceDark: boolean): Theme =>
  saved === 'light' || saved === 'dark' ? saved : deviceDark ? 'dark' : 'light';
const deviceTheme = (): Theme => resolveTheme(null, window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
export const readTheme = (getTheme: () => string | null, deviceDark: boolean): Theme => {
  try { return resolveTheme(getTheme(), deviceDark); } catch { return resolveTheme(null, deviceDark); }
};
const read = (): Theme => readTheme(() => localStorage.getItem('theme'), deviceTheme() === 'dark');
export const theme = signal<Theme>(read());

export const setTheme = (t: Theme) => {
  theme.set(t);
  // Synchronous so charts read new CSS variables in same change detection pass.
  document.documentElement.dataset['theme'] = t;
  try { localStorage.setItem('theme', t); } catch { /* storage unavailable: theme still applies for this session */ }
};
export const cycleTheme = () => setTheme(theme() === 'light' ? 'dark' : 'light');
export const themeLabel = (t: Theme) => `Switch to ${NAMES[t === 'light' ? 'dark' : 'light']} (Shift+T)`;

document.documentElement.dataset['theme'] = theme();
export const isDark = computed(() => theme() === 'dark');
