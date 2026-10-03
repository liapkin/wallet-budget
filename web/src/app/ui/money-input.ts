import { Directive } from '@angular/core';

/** `[appMoney]` on a text input: digits plus one `.` or `,` and at most 2 decimals. */
@Directive({
  selector: 'input[appMoney]',
  host: { inputmode: 'decimal', autocomplete: 'off', '(input)': 'sanitize($event)' },
})
export class MoneyInput {
  sanitize(e: Event) {
    const el = e.target as HTMLInputElement;
    const [int = '', ...rest] = el.value.replace(/[^\d.,]/g, '').split(/(?=[.,])/);
    const clean = int + (rest.length ? rest[0].slice(0, 1) + rest.join('').replace(/\D/g, '').slice(0, 2) : '');
    if (clean === el.value) return;
    el.value = clean;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
