import { Directive, ElementRef, HostListener, input, inject } from '@angular/core';

/**
 * Attribute directive `[appMoney]` for money text inputs.
 * Enforces decimal format (digits and a single . or , with max 2 decimals).
 * Allows optional leading "-" if [appMoneyNegative] is true.
 */
@Directive({
  selector: 'input[appMoney]',
  standalone: true,
  host: {
    inputmode: 'decimal',
    autocomplete: 'off',
  },
})
export class MoneyInput {
  allowNegative = input(false, { alias: 'appMoneyNegative' });
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  @HostListener('beforeinput', ['$event'])
  onBeforeInput(e: InputEvent) {
    // Allow deletions (backspace, delete, etc.)
    if (e.inputType.includes('delete') || e.inputType === 'deleteContent' || e.inputType.startsWith('deleteSoft') || e.inputType.startsWith('deleteHard')) {
      return;
    }

    // For paste/drop or other insertions, check if result would be valid.
    // If not, sanitize the pasted/dropped content instead of rejecting.
    if (e.data) {
      const input = this.el.nativeElement;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const before = input.value.slice(0, start);
      const after = input.value.slice(end);
      const newVal = before + e.data + after;

      if (!this.isValidFormat(newVal)) {
        // Sanitize the input data instead of rejecting
        e.preventDefault();
        const sanitized = this.sanitize(newVal);
        input.value = sanitized;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  @HostListener('input')
  onInput() {
    const input = this.el.nativeElement;
    if (!this.isValidFormat(input.value)) {
      input.value = this.sanitize(input.value);
    }
  }

  private isValidFormat(val: string): boolean {
    const pattern = this.allowNegative() ? /^-?\d*([.,]\d{0,2})?$/ : /^\d*([.,]\d{0,2})?$/;
    return pattern.test(val);
  }

  private sanitize(val: string): string {
    // Remove leading "-" if negative not allowed
    let result = this.allowNegative() ? val : val.replace(/^-/, '');

    // Check for leading minus
    let isNegative = false;
    if (result.startsWith('-')) {
      isNegative = true;
      result = result.slice(1);
    }

    // Keep only digits
    const parts = result.split(/[.,]/);
    if (parts.length > 2) {
      // Multiple decimal separators - keep first, remove rest
      result = parts[0] + (parts[0] ? '.' + parts.slice(1).join('').slice(0, 2) : parts[1]);
    } else if (parts.length === 2) {
      // One decimal separator - keep up to 2 decimals
      result = parts[0] + '.' + parts[1].slice(0, 2);
    }

    // Remove any non-digit characters except the single decimal separator
    result = result.replace(/[^\d.]/g, '');

    // Ensure no leading zeros before decimal (e.g., "007.50" -> "7.50")
    const decimalParts = result.split('.');
    if (decimalParts[0] && decimalParts[0] !== '0') {
      decimalParts[0] = String(parseInt(decimalParts[0], 10));
    }
    result = decimalParts.join('.');

    // Re-add negative if needed
    if (isNegative && this.allowNegative() && result && result !== '0' && result !== '0.') {
      result = '-' + result;
    }

    return result;
  }
}
