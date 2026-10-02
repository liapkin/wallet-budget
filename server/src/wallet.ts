import { join } from 'node:path';

process.loadEnvFile(join(import.meta.dirname, '..', '..', '.env'));

type Params = Record<string, string | number | string[]>;

const BASE = 'https://rest.budgetbakers.com/wallet';

// GET only. Errors carry status and path, never headers or body.
export async function get<T = any>(path: string, params: Params = {}): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams(Object.entries(params).flatMap(([k, v]) => [v].flat().map((x) => [k, String(x)])))}`;
  for (;;) {
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${process.env.WALLET_API_TOKEN}` } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 60;
      console.error(`rate limited, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Wallet GET ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }
}

export async function* pages<T = any>(path: string, key: string, params: Params = {}): AsyncGenerator<T> {
  let offset: number | undefined = 0;
  while (offset !== undefined) {
    const r: any = await get(path, { ...params, limit: 200, offset });
    yield* r[key] as T[];
    offset = r.nextOffset;
  }
}
