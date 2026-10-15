import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DurableDatabase, type DurableStorage } from '../src/database.ts';

const storage = (sqlite: DatabaseSync): DurableStorage => ({
  sql: {
    exec<T = Record<string, unknown>>(sql: string, ...bindings: unknown[]) {
      if (!bindings.length && sql.includes(';')) {
        sqlite.exec(sql);
        return { toArray: () => [] as T[] };
      }
      return { toArray: () => sqlite.prepare(sql).all(...bindings as any[]) as T[] };
    },
  },
  transactionSync(callback) {
    sqlite.exec('BEGIN');
    try {
      const result = callback();
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
});

test('Durable SQL adapter preserves changes, insert IDs, and rollback', () => {
  const sqlite = new DatabaseSync(':memory:');
  const db = new DurableDatabase(storage(sqlite));
  db.exec('CREATE TABLE item (id INTEGER PRIMARY KEY, value TEXT)');
  const inserted = db.prepare('INSERT INTO item (value) VALUES (?)').run('kept');
  assert.equal(inserted.changes, 1);
  assert.equal(inserted.lastInsertRowid, 1);
  assert.throws(() => db.transaction(() => {
    db.prepare('INSERT INTO item (value) VALUES (?)').run('rolled back');
    throw new Error('stop');
  }), /stop/);
  assert.deepEqual(db.prepare('SELECT id, value FROM item').all().map((row) => ({ ...row })), [{ id: 1, value: 'kept' }]);
  sqlite.close();
});
