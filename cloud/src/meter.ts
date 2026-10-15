import { AsyncLocalStorage } from 'node:async_hooks';

export type Meter = { rowsRead: number; rowsWritten: number };
export type RouteUsage = { calls: number; rowsRead: number; rowsWritten: number };

export const meterStore = new AsyncLocalStorage<Meter>();

const MAX_ROUTES = 200;

/** Collapses ids and month/date segments so routes aggregate: /api/month-close/2026-03 -> /api/month-close/:month. */
export function routeKey(method: string, path: string): string {
  const p = path.split('/').map((s) => (/^\d{4}-\d{2}(-\d{2})?$/.test(s) ? ':month' : /^\d+$/.test(s) ? ':id' : s)).join('/');
  return `${method} ${p}`;
}

export class UsageMeter {
  readonly since = new Date().toISOString();
  private readonly routes = new Map<string, RouteUsage>();

  add(route: string, m: Meter): void {
    const key = this.routes.has(route) || this.routes.size < MAX_ROUTES ? route : 'other';
    const u = this.routes.get(key) ?? { calls: 0, rowsRead: 0, rowsWritten: 0 };
    u.calls++;
    u.rowsRead += m.rowsRead;
    u.rowsWritten += m.rowsWritten;
    this.routes.set(key, u);
  }

  /** Runs fn with a fresh per-request counter and records it under route. */
  async track<T>(route: string, fn: () => Promise<T>): Promise<{ result: T; meter: Meter }> {
    const meter: Meter = { rowsRead: 0, rowsWritten: 0 };
    try {
      return { result: await meterStore.run(meter, fn), meter };
    } finally {
      this.add(route, meter);
    }
  }

  report() {
    const all = [...this.routes].map(([route, u]) => ({ route, ...u }));
    const sum = (k: keyof RouteUsage) => all.reduce((n, r) => n + r[k], 0);
    return {
      since: this.since,
      totals: { rowsRead: sum('rowsRead'), rowsWritten: sum('rowsWritten'), calls: sum('calls') },
      routes: all.sort((a, b) => b.rowsRead - a.rowsRead).slice(0, 30),
    };
  }
}
