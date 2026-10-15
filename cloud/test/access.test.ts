import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccessJwt } from '../src/access.ts';

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

test('Access JWT requires valid signature and exact owner claims', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const issuer = 'https://budget-test.cloudflareaccess.com';
  const settings = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'app-audience', OWNER_EMAIL: 'owner@example.test' };
  const fetcher = async () => new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }), {
    headers: { 'content-type': 'application/json' },
  });
  const make = async (overrides: Record<string, unknown> = {}) => {
    const header = encode({ alg: 'RS256', kid: 'key-1', typ: 'JWT' });
    const payload = encode({ iss: issuer, aud: ['app-audience'], email: 'owner@example.test', type: 'app', nbf: 900, exp: 1_100, ...overrides });
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
    return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
  };

  assert.equal((await verifyAccessJwt(await make(), settings, 1_000, fetcher)).email, 'owner@example.test');
  await assert.rejects(verifyAccessJwt(await make({ email: 'other@example.test' }), settings, 1_000, fetcher), /identity/);
  await assert.rejects(verifyAccessJwt(await make({ aud: ['other'] }), settings, 1_000, fetcher), /claims/);
  await assert.rejects(verifyAccessJwt(await make({ exp: 1_000 }), settings, 1_000, fetcher), /expired/);
  const token = await make();
  await assert.rejects(verifyAccessJwt((() => { const i = token.length - 100; return `${token.slice(0, i)}${token[i] === 'A' ? 'B' : 'A'}${token.slice(i + 1)}`; })(), settings, 1_000, fetcher), /signature/);
  await assert.rejects(verifyAccessJwt(await make(), { ...settings, OWNER_EMAIL: '' }, 1_000, fetcher), /settings/);
});
