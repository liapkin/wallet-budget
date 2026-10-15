import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeSchema } from '../../server/src/db.ts';
import type { Database, Statement } from '../../server/src/runtime.ts';
import { DATA_VERSION, MigrationStore, TABLES } from '../src/migration.ts';

const open = (): { sqlite: DatabaseSync; db: Database } => {
  const sqlite = new DatabaseSync(':memory:');
  const db: Database = {
    prepare: (sql) => sqlite.prepare(sql) as Statement,
    exec: (sql) => sqlite.exec(sql),
    transaction: (fn) => {
      sqlite.exec('BEGIN');
      try {
        const result = fn();
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  initializeSchema(db);
  return { sqlite, db };
};

const emptyManifest = () => Object.fromEntries(Object.keys(TABLES).map((name) => [name, 0]));

test('migration preserves IDs, makes chunk retry idempotent, and verifies counts', async () => {
  const { sqlite, db } = open();
  const migration = new MigrationStore(db);
  const manifest = { ...emptyManifest(), config: 1 };
  migration.start(DATA_VERSION, manifest);
  const row = { id: 1, json: '{"currency":"EUR"}' };
  await migration.chunk('config', 0, [row]);
  await migration.chunk('config', 0, [row]);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM config').get() as { count: number }).count, 1);
  assert.equal(migration.finalize().finalized, true);
  assert.equal(migration.ready(), true);
  assert.deepEqual(migration.export().tables.config.map((value) => ({ ...value as object })), [row]);
  sqlite.close();
});

test('migration rejects a nonempty destination and changed retries', async () => {
  const first = open();
  first.db.prepare('INSERT INTO config (id, json) VALUES (1, ?)').run('{}');
  assert.throws(() => new MigrationStore(first.db).start(DATA_VERSION, { ...emptyManifest(), config: 1 }), /not empty/);
  first.sqlite.close();

  const second = open();
  const migration = new MigrationStore(second.db);
  migration.start(DATA_VERSION, { ...emptyManifest(), config: 1 });
  await migration.chunk('config', 0, [{ id: 1, json: '{}' }]);
  await assert.rejects(migration.chunk('config', 0, [{ id: 1, json: '{"changed":true}' }]), /different data/);
  second.sqlite.close();
});

const seeded = (): { sqlite: DatabaseSync; store: MigrationStore } => {
  const { sqlite, db } = open();
  sqlite.exec(`DELETE FROM config; INSERT INTO config (id, json) VALUES (1, '{"a":1}');
    INSERT INTO core_actuals (month, key, cents) VALUES ('2026-01','rent',50000),('2026-02','rent',50000);`);
  return { sqlite, store: new MigrationStore(db) };
};
const poster = (store: MigrationStore, hook?: (path: string, body: any) => void) => async (path: string, body: any) => {
  hook?.(path, body);
  const response = await store.handle(new Request(`https://x${path}`, { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
};

test('export -> JSON -> import round trip reproduces every table', async () => {
  const { tmpdir } = await import('node:os');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { loadMigrationSource, uploadMigration } = await import('../src/migration-source.ts');
  const source = seeded().store;
  const file = join(mkdtempSync(join(tmpdir(), 'mig-')), 'snap.json');
  writeFileSync(file, JSON.stringify(source.export()));
  const target = open();
  const store = new MigrationStore(target.db);
  await uploadMigration(loadMigrationSource(file), poster(store), 1);
  assert.equal(store.ready(), true);
  assert.deepEqual(store.export().tables, source.export().tables);
});

test('JSON source rejects wrong version and unknown tables', async () => {
  const { tmpdir } = await import('node:os');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { loadMigrationSource } = await import('../src/migration-source.ts');
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  const write = (name: string, value: unknown) => { writeFileSync(join(dir, name), JSON.stringify(value)); return join(dir, name); };
  const tables = seeded().store.export().tables;
  assert.throws(() => loadMigrationSource(write('v.json', { version: 99, tables })), /version/);
  assert.throws(() => loadMigrationSource(write('t.json', { version: DATA_VERSION, tables: { ...tables, secrets: [] } })), /unknown table/);
});

test('finalize rejects a count mismatch', async () => {
  const { db } = open();
  const store = new MigrationStore(db);
  store.start(DATA_VERSION, { ...emptyManifest(), config: 1 });
  assert.throws(() => store.finalize(), /count mismatch/);
});

test('interrupted upload resumes on restart without duplicating rows', async () => {
  const { tmpdir } = await import('node:os');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { loadMigrationSource, uploadMigration } = await import('../src/migration-source.ts');
  const source = seeded().store;
  const file = join(mkdtempSync(join(tmpdir(), 'mig-')), 'snap.json');
  writeFileSync(file, JSON.stringify(source.export()));
  const store = new MigrationStore(open().db);
  const data = loadMigrationSource(file);
  let chunks = 0;
  await assert.rejects(uploadMigration(data, poster(store, (path) => { if (path.endsWith('/chunk') && ++chunks === 2) throw new Error('network down'); }), 1), /network down/);
  assert.equal(store.ready(), false);
  await uploadMigration(data, poster(store), 1);
  assert.deepEqual(store.export().tables, source.export().tables);
});
