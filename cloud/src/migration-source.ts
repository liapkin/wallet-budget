import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DATA_VERSION, TABLES, type TableName } from './migration.ts';

export type MigrationData = Record<TableName, Record<string, unknown>[]>;
type Post = (path: string, body: unknown) => Promise<unknown>;

const names = Object.keys(TABLES) as TableName[];

/** Reads a cloud-snapshot JSON export (by .json extension or leading `{`) or a SQLite file. */
export function loadMigrationSource(path: string): MigrationData {
  const bytes = readFileSync(path);
  if (path.endsWith('.json') || bytes.subarray(0, 1).toString() === '{') {
    const input = JSON.parse(bytes.toString('utf8')) as { version?: unknown; tables?: Record<string, unknown> };
    if (input.version !== DATA_VERSION) throw new Error(`unsupported snapshot version ${String(input.version)}`);
    const tables = input.tables ?? {};
    const unknown = Object.keys(tables).find((table) => !(table in TABLES));
    if (unknown) throw new Error(`snapshot has unknown table ${unknown}`);
    return Object.fromEntries(names.map((table) => {
      if (!Array.isArray(tables[table])) throw new Error(`snapshot is missing table ${table}`);
      return [table, tables[table]];
    })) as MigrationData;
  }
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return Object.fromEntries(names.map((table) => [table, database.prepare(`SELECT ${TABLES[table].join(',')} FROM ${table}`).all()])) as MigrationData;
  } finally {
    database.close();
  }
}

/** Same start/chunk/finalize path for every source; safe to rerun after an interruption. */
export async function uploadMigration(data: MigrationData, post: Post, chunkSize = 100): Promise<void> {
  const manifest = Object.fromEntries(names.map((table) => [table, data[table].length]));
  await post('/__cloud/migration/start', { version: DATA_VERSION, manifest });
  for (const table of names) {
    for (let offset = 0; offset < data[table].length; offset += chunkSize) {
      await post('/__cloud/migration/chunk', { table, offset, rows: data[table].slice(offset, offset + chunkSize) });
    }
  }
  await post('/__cloud/migration/finalize', {});
}
