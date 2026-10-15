import type { Database } from '../../server/src/runtime.ts';

export const DATA_VERSION = 1;

export const TABLES = {
  records: ['id', 'source', 'ext_id', 'account', 'category', 'amount_cents', 'type', 'payment_type', 'note', 'payee', 'date_utc', 'raw_json', 'group_override', 'is_dup', 'dup_of', 'grp', 'month', 'created_in_app'],
  config: ['id', 'json'],
  core_actuals: ['month', 'key', 'cents'],
  accounts: ['id', 'name', 'balance_cents', 'currency', 'updated_at'],
  categories: ['id', 'name', 'parent'],
  sync_state: ['key', 'value'],
  balance_snapshots: ['day', 'account', 'balance_cents'],
  crypto_snapshots: ['ts', 'symbol', 'amount', 'price_cents', 'pct24h', 'kind'],
  dup_decisions: ['a', 'b', 'decision'],
  month_close: ['month', 'json'],
} as const;

export type TableName = keyof typeof TABLES;
type Scalar = string | number | null;
type Manifest = Record<TableName, number>;
type State = { version: number; manifest: Manifest; received: Partial<Record<TableName, number>>; finalized: boolean };

export class MigrationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const exactKeys = (row: Record<string, unknown>, columns: readonly string[]): boolean => {
  const keys = Object.keys(row).sort();
  return keys.length === columns.length && [...columns].sort().every((column, index) => column === keys[index]);
};

const validManifest = (input: unknown): input is Manifest => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return exactKeys(value, Object.keys(TABLES)) && Object.values(value).every((count) => Number.isSafeInteger(count) && Number(count) >= 0);
};

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const digest = async (value: unknown): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export class MigrationStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS __cloud_migration (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS __cloud_migration_chunks (table_name TEXT, chunk_offset INTEGER, row_count INTEGER, digest TEXT, PRIMARY KEY(table_name, chunk_offset));
      CREATE TABLE IF NOT EXISTS __cloud_deployment (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }

  ready(): boolean {
    return !!this.db.prepare("SELECT 1 FROM __cloud_deployment WHERE key='ready' AND value='1'").get();
  }

  markReady(): void {
    this.db.prepare("INSERT OR REPLACE INTO __cloud_deployment (key, value) VALUES ('ready', '1')").run();
  }

  state(): State | undefined {
    const row = this.db.prepare('SELECT json FROM __cloud_migration WHERE id=1').get() as { json: string } | undefined;
    return row ? JSON.parse(row.json) as State : undefined;
  }

  start(version: unknown, manifest: unknown): State {
    if (version !== DATA_VERSION || !validManifest(manifest)) throw new MigrationError('invalid migration manifest');
    const existing = this.state();
    if (existing) {
      if (JSON.stringify(existing.manifest) !== JSON.stringify(manifest)) throw new MigrationError('migration already started with another manifest', 409);
      return existing;
    }
    for (const table of Object.keys(TABLES) as TableName[]) {
      const count = (this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
      if (count !== 0) throw new MigrationError('destination database is not empty', 409);
    }
    const state: State = { version: DATA_VERSION, manifest, received: {}, finalized: false };
    this.db.prepare('INSERT INTO __cloud_migration (id, json) VALUES (1, ?)').run(JSON.stringify(state));
    return state;
  }

  async chunk(table: unknown, offset: unknown, rows: unknown): Promise<State> {
    const state = this.state();
    if (!state || state.finalized) throw new MigrationError('migration is not active', 409);
    if (typeof table !== 'string' || !(table in TABLES) || !Number.isSafeInteger(offset) || Number(offset) < 0 || !Array.isArray(rows) || rows.length < 1 || rows.length > 250) {
      throw new MigrationError('invalid migration chunk');
    }
    const name = table as TableName;
    const columns = TABLES[name];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || !exactKeys(row as Record<string, unknown>, columns)) throw new MigrationError('invalid migration row');
      if (Object.values(row).some((value) => value !== null && typeof value !== 'string' && typeof value !== 'number')) throw new MigrationError('invalid migration value');
    }
    const hash = await digest(rows);
    const previous = this.db.prepare('SELECT row_count AS rowCount, digest FROM __cloud_migration_chunks WHERE table_name=? AND chunk_offset=?').get(name, offset) as
      { rowCount: number; digest: string } | undefined;
    if (previous) {
      if (previous.rowCount !== rows.length || previous.digest !== hash) throw new MigrationError('chunk offset already contains different data', 409);
      return state;
    }
    const received = (state.received[name] ?? 0) + rows.length;
    if (received > state.manifest[name]) throw new MigrationError('chunk exceeds manifest count', 409);
    const placeholders = columns.map(() => '?').join(',');
    const insert = this.db.prepare(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${placeholders})`);
    return this.db.transaction(() => {
      for (const row of rows as Record<string, Scalar>[]) insert.run(...columns.map((column) => row[column]));
      this.db.prepare('INSERT INTO __cloud_migration_chunks (table_name, chunk_offset, row_count, digest) VALUES (?, ?, ?, ?)').run(name, offset, rows.length, hash);
      state.received[name] = received;
      this.db.prepare('UPDATE __cloud_migration SET json=? WHERE id=1').run(JSON.stringify(state));
      return state;
    });
  }

  finalize(): State {
    const state = this.state();
    if (!state || state.finalized) throw new MigrationError('migration is not active', 409);
    for (const table of Object.keys(TABLES) as TableName[]) {
      const count = (this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
      if (count !== state.manifest[table]) throw new MigrationError(`count mismatch for ${table}`, 409);
    }
    state.finalized = true;
    this.db.transaction(() => {
      this.db.prepare('UPDATE __cloud_migration SET json=? WHERE id=1').run(JSON.stringify(state));
      this.markReady();
    });
    return state;
  }

  export(): { version: number; tables: Record<TableName, unknown[]> } {
    return this.db.transaction(() => {
      const tables = {} as Record<TableName, unknown[]>;
      for (const table of Object.keys(TABLES) as TableName[]) tables[table] = this.db.prepare(`SELECT ${TABLES[table].join(',')} FROM ${table}`).all();
      return { version: DATA_VERSION, tables };
    });
  }

  async handle(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/__cloud/migration/status') return json(this.state() ?? null);
      if (request.method === 'GET' && path === '/__cloud/export') return json(this.export());
      const body = await request.json() as Record<string, unknown>;
      if (request.method === 'POST' && path === '/__cloud/migration/start') return json(this.start(body.version, body.manifest));
      if (request.method === 'POST' && path === '/__cloud/migration/chunk') return json(await this.chunk(body.table, body.offset, body.rows));
      if (request.method === 'POST' && path === '/__cloud/migration/finalize') return json(this.finalize());
      return json({ error: 'not found' }, 404);
    } catch (error) {
      if (error instanceof MigrationError) return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError) return json({ error: 'invalid JSON' }, 400);
      return json({ error: 'migration failed' }, 500);
    }
  }
}
