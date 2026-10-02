import type { Currency } from './types.ts';

export const toCents = (amount: number): number => Math.round(amount * 100);

const formats = {
  EUR: new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }),
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
};

export const fmt = (cents: number, currency: Currency = 'EUR'): string => formats[currency].format(cents / 100);
