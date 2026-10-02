import { signal } from '@angular/core';

const read = () => { try { return localStorage.getItem('privacy') === '1'; } catch { return false; } };
export const hidden = signal(read());

export const togglePrivacy = () => {
  hidden.update((v) => !v);
  try { localStorage.setItem('privacy', hidden() ? '1' : '0'); } catch { /* storage unavailable: toggle still works for this session */ }
};
