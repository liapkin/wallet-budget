export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array): string => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const unb64u = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const cat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};

const hkdf = async (salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number): Promise<Uint8Array<ArrayBuffer>> => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
};

/** RFC 8291 aes128gcm body for a single record. */
export async function encryptPayload(sub: PushSubscription['keys'], payload: string): Promise<Uint8Array<ArrayBuffer>> {
  const ua = unb64u(sub.p256dh);
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(unb64u(sub.auth), secret, cat(enc.encode('WebPush: info\0'), ua, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['encrypt']);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, cat(enc.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([asPublic.length]), asPublic, body);
}

/** RFC 8292 ES256 JWT; private key is the raw 32-byte scalar, public key the 65-byte point, both base64url. */
export async function vapidJwt(endpoint: string, keys: VapidKeys, nowMs = Date.now()): Promise<string> {
  const pub = unb64u(keys.publicKey);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)) }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (o: object) => b64u(enc.encode(JSON.stringify(o)));
  const input = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: keys.subject })}`;
  return `${input}.${b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input)))}`;
}

/** Returns the push service's HTTP status; 404/410 mean the subscription is gone. */
export async function sendPush(sub: PushSubscription, payloadJson: string, keys: VapidKeys): Promise<number> {
  const response = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${await vapidJwt(sub.endpoint, keys)}, k=${keys.publicKey}`,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '3600',
    },
    body: await encryptPayload(sub.keys, payloadJson),
  });
  await response.body?.cancel();
  return response.status;
}
