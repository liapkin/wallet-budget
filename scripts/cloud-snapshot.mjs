import { mkdir, open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { accessHeaders, readAccessCookie } from './cloud-auth.mjs';

const [baseArg, outputArg] = process.argv.slice(2);
if (!baseArg) throw new Error('usage: node scripts/cloud-snapshot.mjs <https-url> [output.json]');
const base = new URL(baseArg);
if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('snapshot URL must use HTTPS');
const output = resolve(outputArg ?? `data/cloud-snapshots/budget-${new Date().toISOString().slice(0, 10)}.json`);
const cookie = await readAccessCookie();
const response = await fetch(new URL('/__cloud/export', base), {
  headers: accessHeaders(cookie),
  redirect: 'error',
});
if (!response.ok) throw new Error(`snapshot request failed (${response.status})`);
const bytes = new Uint8Array(await response.arrayBuffer());
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const temporary = `${output}.${process.pid}.tmp`;
const file = await open(temporary, 'wx', 0o600);
try {
  await file.writeFile(bytes);
  await file.sync();
} finally {
  await file.close();
}
await rename(temporary, output);
console.log(`Private snapshot written: ${output}`);
