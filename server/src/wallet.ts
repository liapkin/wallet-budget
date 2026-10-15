import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { requireWalletCurrency } from './db.ts';
import { currentRuntime, runtimeEnv } from './runtime.ts';

let fileEnv: Record<string, string | undefined> | undefined;
const localFileEnv = (): Record<string, string | undefined> => {
  if (fileEnv) return fileEnv;
  fileEnv = {};
  const envFile = join(import.meta.dirname, '..', '..', '.env');
  if (runtimeEnv().DEMO === '1' || !existsSync(envFile)) return fileEnv;
  fileEnv = parseEnv(readFileSync(envFile, 'utf8'));
  return fileEnv!;
};
export const secret = (name: string): string | undefined =>
  runtimeEnv()[name] ?? (currentRuntime() ? undefined : localFileEnv()[name]);

type Params = Record<string, string | number | string[]>;

const BASE = 'https://rest.budgetbakers.com/wallet';

export class RetryAfterError extends Error {
  readonly retryAt: string;
  constructor(retryAt: string) {
    super('Wallet GET rate limited');
    this.retryAt = retryAt;
  }
}

// GET for sync; POST only for user-confirmed record creation; DELETE only for records this app created. Errors carry status, path and the API's short error code, never headers or bodies.
async function call<T>(method: 'GET' | 'POST' | 'DELETE', url: string, path: string, body?: unknown): Promise<T> {
  requireWalletCurrency();
  const token = secret('WALLET_API_TOKEN');
  if (!token) throw new Error('WALLET_API_TOKEN is not set; add it to .env');
  for (let attempt = 1; ; attempt++) {
    requireWalletCurrency();
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 60, 120);
      if (method !== 'GET') throw new Error(`Wallet ${method} ${path} failed: rate limited`);
      if (currentRuntime()) throw new RetryAfterError(new Date(Date.now() + wait * 1000).toISOString());
      if (attempt >= 5) throw new Error(`Wallet ${method} ${path} failed: rate limited`);
      console.error(`rate limited, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const code = method !== 'GET' ? await res.json().then((j: any) => (typeof j?.code === 'string' ? ` (${j.code.slice(0, 60)})` : ''), () => '') : '';
      throw new Error(`Wallet ${method} ${path} failed: ${res.status}${code}`);
    }
    return (await res.json()) as T;
  }
}

export async function get<T = any>(path: string, params: Params = {}): Promise<T> {
  const q = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => [v].flat().map((x) => [k, String(x)])));
  return call('GET', `${BASE}${path}?${q}`, path);
}

export const post = <T = any>(path: string, body: unknown): Promise<T> => call('POST', `${BASE}${path}`, path, body);

export const del = <T = any>(path: string, ids: string[]): Promise<T> => call('DELETE', `${BASE}${path}`, path, { ids });

export async function* pages<T = any>(path: string, key: string, params: Params = {}): AsyncGenerator<T> {
  let offset: number | undefined = 0;
  while (offset !== undefined) {
    const r: any = await get(path, { ...params, limit: 200, offset });
    yield* r[key] as T[];
    offset = r.nextOffset;
  }
}
