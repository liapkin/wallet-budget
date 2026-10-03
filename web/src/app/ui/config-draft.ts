import { computed, DestroyRef, inject, signal, type WritableSignal } from '@angular/core';
import type { Config } from '../../../../shared/src/types.ts';
import { Api } from '../api';
import { Toast } from './toast';

/** Clone, mutate, replace: a new reference so signals notify. */
export function editDraft<T>(draft: WritableSignal<T | null>, fn: (c: T) => void) {
  draft.update((d) => {
    const c = structuredClone(d!);
    fn(c);
    return c;
  });
}

/** Saved/draft config pair with dirty tracking, save and the unsaved-changes unload guard. Call in an injection context. */
export function configDraft(savedMsg: string, onSaved?: (c: Config) => void) {
  const api = inject(Api);
  const toast = inject(Toast);
  const saved = signal<Config | null>(null);
  const draft = signal<Config | null>(null);
  const failed = signal(false);
  const saving = signal(false);
  const dirty = computed(() => JSON.stringify(draft()) !== JSON.stringify(saved()));
  const load = (c: Config) => {
    saved.set(c);
    draft.set(structuredClone(c));
  };
  api.config().then(load, () => failed.set(true));

  const unload = (e: BeforeUnloadEvent) => dirty() && e.preventDefault();
  window.addEventListener('beforeunload', unload);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', unload));

  return {
    saved, draft, failed, saving, dirty,
    discard: () => draft.set(structuredClone(saved()!)),
    async save() {
      if (!dirty() || saving()) return;
      saving.set(true);
      try {
        load(await api.saveConfig(draft()!));
        onSaved?.(saved()!);
        toast.show(savedMsg);
      } catch (e: any) {
        toast.show(e?.error?.error ?? 'Save failed', 'err');
      } finally {
        saving.set(false);
      }
    },
  };
}
