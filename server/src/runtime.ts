import { AsyncLocalStorage } from 'node:async_hooks';
import type { SyncJob } from '../../shared/src/sync-job.ts';

export type RunResult = { changes: number | bigint; lastInsertRowid: number | bigint };

export interface Statement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): RunResult;
}

export interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  close?(): void;
}

export interface SyncController {
  start(): Promise<SyncJob> | SyncJob;
  status(): SyncJob;
}

export type Runtime = {
  db: Database;
  env: Record<string, string | undefined>;
  sync?: SyncController;
};

const storage = new AsyncLocalStorage<Runtime>();

export const currentRuntime = (): Runtime | undefined => storage.getStore();
export const runtimeEnv = (): Record<string, string | undefined> => currentRuntime()?.env ?? process.env;

export function withRuntime<T>(runtime: Runtime, fn: () => T): T {
  return storage.run(runtime, fn);
}

