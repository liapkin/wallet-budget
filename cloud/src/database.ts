import type { Database, RunResult, Statement } from '../../server/src/runtime.ts';

export interface SqlCursor<T = Record<string, unknown>> {
  toArray(): T[];
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
    return this.sql.exec(this.query, ...params).toArray()[0];
  }

  all(...params: unknown[]): any[] {
    return this.sql.exec(this.query, ...params).toArray();
  }

  run(...params: unknown[]): RunResult {
    this.sql.exec(this.query, ...params).toArray();
    const result = this.sql.exec<{ changes: number; lastInsertRowid: number }>(
      'SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid',
    ).toArray()[0];
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
    this.storage.sql.exec(sql).toArray();
  }

  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }
}
