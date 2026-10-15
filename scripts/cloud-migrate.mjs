import { resolve } from 'node:path';
import { loadMigrationSource, uploadMigration } from '../cloud/src/migration-source.ts';
import { accessHeaders, readAccessCookie } from './cloud-auth.mjs';

const [baseArg, databaseArg = 'data/budget.db'] = process.argv.slice(2);
if (!baseArg) throw new Error('usage: node scripts/cloud-migrate.mjs <https-url> [database.db|snapshot.json]');
const base = new URL(baseArg);
if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('migration URL must use HTTPS');
const data = loadMigrationSource(resolve(databaseArg));
const cookie = await readAccessCookie();
const request = async (path, body) => {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: accessHeaders(cookie, base.origin, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`migration request failed (${response.status})`);
  return response.json();
};

await uploadMigration(data, request);
console.log('Migration finalized; disable MIGRATION_ENABLED before using hosted app.');
