export const toCents = (eur: number): number => Math.round(eur * 100);

const nf = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export const fmt = (cents: number): string => nf.format(cents / 100);
