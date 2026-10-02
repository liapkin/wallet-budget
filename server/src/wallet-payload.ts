import { athensLocalToUtc } from '../../shared/src/month.ts';

export type NewWalletRecord = { accountId: string; categoryId?: string; type: 'Expenses' | 'Income'; cents: number; date: string; note: string };

/** Body item for POST /v1/api/records. `date` is Athens-local `YYYY-MM-DDTHH:mm`; amount is negative for expenses. */
export function walletPayload(r: NewWalletRecord) {
  const [y, mo, d, h, mi] = r.date.split(/[-T:]/).map(Number) as [number, number, number, number, number];
  return {
    accountId: r.accountId,
    amount: { value: (r.type === 'Expenses' ? -r.cents : r.cents) / 100, currencyCode: 'EUR' },
    recordDate: athensLocalToUtc(y, mo, d, h, mi, 0),
    ...(r.categoryId ? { categoryId: r.categoryId } : {}),
    ...(r.note ? { note: r.note.slice(0, 255) } : {}),
  };
}
