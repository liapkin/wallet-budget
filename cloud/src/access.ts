export type AccessSettings = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
};

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtPayload = {
  aud?: unknown;
  email?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iss?: unknown;
  type?: unknown;
};
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const jwksCache = new Map<string, { expires: number; keys: Jwk[] }>();
const encoder = new TextEncoder();

const decodePart = <T>(part: string): T => {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('invalid JWT encoding');
  const value = part.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(value.padEnd(Math.ceil(value.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
};

const decodeBytes = (part: string): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('invalid JWT encoding');
  const value = part.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(value.padEnd(Math.ceil(value.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
};

const issuerFrom = (settings: AccessSettings): string => {
  const raw = settings.ACCESS_TEAM_DOMAIN?.trim();
  if (!raw) throw new Error('missing Access team domain');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('invalid Access team domain');
  }
  return url.origin;
};

async function keysFor(issuer: string, fetcher: Fetcher, force = false): Promise<Jwk[]> {
  const cached = jwksCache.get(issuer);
  if (!force && cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Access keys unavailable');
  const body = await response.json() as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new Error('invalid Access keys');
  const keys = body.keys.filter((key): key is Jwk => !!key && typeof key === 'object');
  jwksCache.set(issuer, { expires: Date.now() + 5 * 60_000, keys });
  return keys;
}

/** Verifies Access signature and every identity claim used for authorization. */
export async function verifyAccessJwt(
  token: string,
  settings: AccessSettings,
  nowSeconds = Math.floor(Date.now() / 1000),
  fetcher: Fetcher = fetch,
): Promise<JwtPayload> {
  if (!settings.ACCESS_AUD?.trim() || !settings.OWNER_EMAIL?.trim()) throw new Error('missing Access settings');
  if (token.length > 16_384) throw new Error('invalid JWT');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid JWT');
  const header = decodePart<JwtHeader>(parts[0]);
  const payload = decodePart<JwtPayload>(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || (header.typ !== undefined && header.typ !== 'JWT')) {
    throw new Error('invalid JWT header');
  }
  const issuer = issuerFrom(settings);
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== issuer || !audience.includes(settings.ACCESS_AUD.trim()) || payload.type !== 'app') throw new Error('invalid JWT claims');
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds || (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > nowSeconds))) {
    throw new Error('expired or inactive JWT');
  }
  if (typeof payload.email !== 'string' || payload.email.trim().toLowerCase() !== settings.OWNER_EMAIL.trim().toLowerCase()) {
    throw new Error('wrong Access identity');
  }

  let keys = await keysFor(issuer, fetcher);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    keys = await keysFor(issuer, fetcher, true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk || jwk.kty !== 'RSA' || (jwk.alg && jwk.alg !== 'RS256') || (jwk.use && jwk.use !== 'sig')) throw new Error('unknown Access key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('invalid JWT signature');
  return payload;
}

export const accessToken = (request: Request): string => request.headers.get('cf-access-jwt-assertion') ?? '';
