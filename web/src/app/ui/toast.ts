import { Component, Injectable, inject, signal } from '@angular/core';

export type ToastItem = { id: number; msg: string; kind: 'ok' | 'err' };

@Injectable({ providedIn: 'root' })
export class Toast {
  readonly items = signal<ToastItem[]>([]);
  private n = 0;
  show(msg: string, kind: 'ok' | 'err' = 'ok') {
    const id = ++this.n;
    this.items.update((l) => [...l, { id, msg, kind }]);
    setTimeout(() => this.items.update((l) => l.filter((t) => t.id !== id)), 3000);
  }
}

@Component({
  selector: 'app-toasts',
  template: `<div class="toast-stack" role="status" aria-live="polite">
    @for (t of toast.items(); track t.id) {
      <div class="toast" [class.err]="t.kind === 'err'">{{ t.msg }}</div>
    }
  </div>`,
})
export class Toasts {
  protected toast = inject(Toast);
}
