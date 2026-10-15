import type { Database, RunResult, Statement } from '../../server/src/runtime.ts';
import { meterStore } from './meter.ts';

export interface SqlCursor<T = Record<string, unknown>> {
  toArray(): T[];
  readonly rowsRead?: number;
  readonly rowsWritten?: number;
}

/** Consumes the cursor, then adds its row counts to the current request's meter. */
function drain<T>(cursor: SqlCursor<T>): T[] {
  const rows = cursor.toArray();
  const m = meterStore.getStore();
  if (m) {
    m.rowsRead += cursor.rowsRead ?? 0;
    m.rowsWritten += cursor.rowsWritten ?? 0;
  }
  return rows;
}

export interface DurableSql {
  exec<T = Record<string, unknown>>(sql: string, ...bindings: unknown[]): SqlCursor<T>;
}

export interface DurableStorage {
  sql: DurableSql;
  transactionSync<T>(callback: () => T): T;
}

class DurableStatement implements Statement {
  private readonly sql: DurableSql;
  private readonly query: string;

  constructor(sql: DurableSql, query: string) {
    this.sql = sql;
    this.query = query;
  }

  get(...params: unknown[]): any {
    return drain(this.sql.exec(this.query, ...params))[0];
  }

  all(...params: unknown[]): any[] {
    return drain(this.sql.exec(this.query, ...params));
  }

  run(...params: unknown[]): RunResult {
    drain(this.sql.exec(this.query, ...params));
    const result = drain(this.sql.exec<{ changes: number; lastInsertRowid: number }>(
      'SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid',
    ))[0];
    return { changes: result?.changes ?? 0, lastInsertRowid: result?.lastInsertRowid ?? 0 };
  }
}

/** Adapts synchronous Durable Object SQL to the server's node:sqlite-shaped surface. */
export class DurableDatabase implements Database {
  private readonly storage: DurableStorage;

  constructor(storage: DurableStorage) {
    this.storage = storage;
  }

  prepare(sql: string): Statement {
    return new DurableStatement(this.storage.sql, sql);
  }

  exec(sql: string): void {
    drain(this.storage.sql.exec(sql));
  }

  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }
}
