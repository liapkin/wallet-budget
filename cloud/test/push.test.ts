import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPayload, vapidJwt } from '../src/push.ts';

const b64u = (b: ArrayBuffer | Uint8Array): string => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const unb64u = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) o.set(x, (a += x.length) - x.length); return o; };
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']), n * 8));

test('payload decrypts with the subscriber private key (RFC 8291)', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const text = JSON.stringify({ title: 'Stretch', body: 'Hold 30s', url: '/habits' });
  const body = await encryptPayload({ p256dh: b64u(uaPub), auth: b64u(auth) }, text);

  const salt = body.slice(0, 16);
  assert.equal(new DataView(body.buffer).getUint32(16), 4096);
  const idLen = body[20];
  const asPub = body.slice(21, 21 + idLen);
  const cipher = body.slice(21 + idLen);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, ua.privateKey, 256));
  const ikm = await hkdf(auth, secret, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, cek, cipher));
  assert.equal(plain.at(-1), 2);
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), text);
});

test('VAPID JWT has audience, short expiry and a verifiable ES256 signature', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = b64u(await crypto.subtle.exportKey('raw', pair.publicKey));
  const now = 1_800_000_000_000;
  const jwt = await vapidJwt('https://push.example.test/send/abc', { publicKey, privateKey: jwk.d!, subject: 'mailto:me@example.test' }, now);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64u(h))), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(new TextDecoder().decode(unb64u(c)));
  assert.equal(claims.aud, 'https://push.example.test');
  assert.equal(claims.sub, 'mailto:me@example.test');
  assert.ok(claims.exp - now / 1000 <= 12 * 3600 && claims.exp > now / 1000);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, unb64u(s), enc.encode(`${h}.${c}`)), true);
});
