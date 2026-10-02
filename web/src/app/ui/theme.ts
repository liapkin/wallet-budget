import { computed, signal } from '@angular/core';

export type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const NAMES = { system: 'System', light: 'Light', dark: 'Dark' };

const read = (): Theme => {
  try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
};
export const theme = signal<Theme>(read());

export const setTheme = (t: Theme) => {
  theme.set(t);
  // set synchronously so charts re-reading CSS vars in their isDark effect see the new palette
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('theme', t); } catch { /* storage unavailable: theme still applies for this session */ }
};
export const cycleTheme = () => setTheme(ORDER[(ORDER.indexOf(theme()) + 1) % ORDER.length]);
export const themeLabel = (t: Theme) => `Theme: ${NAMES[t]} (click for ${NAMES[ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]]}) (Shift+T)`;

const mq = window.matchMedia?.('(prefers-color-scheme: dark)'); // absent in the jsdom test env
const system = signal(mq?.matches ?? false);
mq?.addEventListener('change', (e) => system.set(e.matches));

export const isDark = computed(() => (theme() === 'system' ? system() : theme() === 'dark'));
