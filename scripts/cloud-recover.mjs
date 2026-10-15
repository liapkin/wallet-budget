import { createInterface } from 'node:readline/promises';
import { accessHeaders, readAccessCookie } from './cloud-auth.mjs';

const [baseArg, action = 'bookmark', timestamp] = process.argv.slice(2);
if (!baseArg || !['bookmark', 'restore'].includes(action) || (action === 'restore' && !timestamp)) {
  throw new Error('usage: node scripts/cloud-recover.mjs <https-url> [bookmark | restore <ISO-timestamp>]');
}
const base = new URL(baseArg);
if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('recovery URL must use HTTPS');
const cookie = await readAccessCookie();
let body;
if (action === 'restore') {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  const confirm = await prompt.question(`Type RESTORE to schedule recovery to ${timestamp}: `);
  prompt.close();
  if (confirm !== 'RESTORE') throw new Error('recovery cancelled');
  body = JSON.stringify({ timestamp, confirm });
}
const response = await fetch(new URL(action === 'bookmark' ? '/__cloud/recovery/bookmark' : '/__cloud/recovery/restore', base), {
  method: action === 'bookmark' ? 'GET' : 'POST',
  headers: accessHeaders(cookie, base.origin, action === 'restore'),
  body,
  redirect: 'error',
});
if (!response.ok) throw new Error(`recovery request failed (${response.status})`);
const result = await response.json();
console.log(action === 'bookmark' ? `Current bookmark: ${result.bookmark}` : `Recovery scheduled from bookmark: ${result.bookmark}`);
