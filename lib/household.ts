import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Family profiles instead of accounts (docs/plan/LOCAL-GRADER.md L5, D23).
 * One household gate (Cloudflare Access or a shared passphrase) guards the whole app; inside it a signed cookie says
 * which profile is studying. "Chế độ quản lý" is a second signed cookie that grants admin powers for 12 hours.
 * With HOUSEHOLD_GATE unset the app keeps its accounts (Better Auth) unchanged.
 */
export type HouseholdBindings = {
  HOUSEHOLD_GATE?: string;
  ACCESS_TEAM_DOMAIN?: string;
  APP_ACCESS_AUD?: string;
  PROFILE_COOKIE_SECRET?: string;
  HOUSEHOLD_LEGACY_PROFILE_IDS?: string;
  HOUSEHOLD_PASSPHRASE_SHA256?: string;
  APP_ENV?: string;
  ENVIRONMENT?: string;
};
export type HouseholdMode = 'access' | 'passphrase';

export const PROFILE_COOKIE = 'lh_profile';
export const MANAGE_COOKIE = 'lh_manage';
export const HOUSE_COOKIE = 'lh_house';
export const MANAGE_HOURS = 12;

export function householdMode(b: HouseholdBindings): HouseholdMode | null {
  return b.HOUSEHOLD_GATE === 'access' || b.HOUSEHOLD_GATE === 'passphrase' ? b.HOUSEHOLD_GATE : null;
}

const encoder = new TextEncoder();
const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

async function mac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function requireSecret(secret: string | undefined) {
  if (!secret || secret.length < 32) throw new Error('PROFILE_COOKIE_SECRET must be at least 32 characters.');
  return secret;
}
export async function signValue(secret: string | undefined, value: string) {
  return value + '.' + (await mac(requireSecret(secret), value));
}
export async function verifyValue(secret: string | undefined, signed: string | undefined | null): Promise<string | null> {
  if (!signed || !secret || secret.length < 32) return null;
  const cut = signed.lastIndexOf('.');
  if (cut <= 0) return null;
  const value = signed.slice(0, cut);
  return sameText(signed.slice(cut + 1), await mac(secret, value)) ? value : null;
}

export function readCookie(header: string | null | undefined, name: string) {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try { return decodeURIComponent(v.join('=')); } catch { return null; }
    }
  }
  return null;
}
export function cookie(name: string, value: string, maxAgeSeconds: number, secure = true) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

/** The profile id from a signed cookie, or null. The caller still checks that the profile exists and is active. */
export async function profileFromCookie(header: string | null | undefined, secret: string | undefined) {
  const id = await verifyValue(secret, readCookie(header, PROFILE_COOKIE));
  return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}
/** Manage mode: a signed expiry time in epoch seconds. */
export async function manageActive(header: string | null | undefined, secret: string | undefined, now = Date.now()) {
  const until = Number(await verifyValue(secret, readCookie(header, MANAGE_COOKIE)));
  return Number.isFinite(until) && until * 1000 > now;
}

const isLocal = (request: Request, b: HouseholdBindings) =>
  b.APP_ENV === 'local' && b.ENVIRONMENT === 'local' && ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
/** A Cloudflare Access user assertion for this application (people, not service tokens). */
export async function verifyAccessUser(token: string, issuer: string, audience: string, keyResolver?: JWTVerifyGetKey) {
  try {
    let keys = keyResolver;
    if (!keys) {
      keys = jwks.get(issuer) ?? createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));
      jwks.set(issuer, keys as ReturnType<typeof createRemoteJWKSet>);
    }
    const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'], clockTolerance: 5 });
    return typeof payload.email === 'string' && payload.email.length > 3 && typeof payload.sub === 'string' && payload.sub.length > 0;
  } catch {
    return false;
  }
}

const passthrough = ['/api/automation/', '/api/health'];
const accountPages = ['/login', '/register', '/forgot-password', '/reset-password'];
const deny = (request: Request, status: number, message: string) =>
  new URL(request.url).pathname.startsWith('/api/')
    ? Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
    : new Response(
        `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Learning Hub</title><main style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>Learning Hub</h1><p>${message}</p></main></html>`,
        { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
      );

/**
 * Runs before the app on every request. Automation keeps its own two-layer auth; account pages and Better Auth routes
 * do not exist in profile mode. Returns a Response to stop, or null to continue.
 */
export async function householdGuard(request: Request, b: HouseholdBindings, keyResolver?: JWTVerifyGetKey): Promise<Response | null> {
  const mode = householdMode(b);
  if (!mode) return null;
  const { pathname } = new URL(request.url);
  if (passthrough.some((p) => pathname.startsWith(p) || pathname === p.replace(/\/$/, ''))) return null;
  if (pathname.startsWith('/api/auth/') || pathname.replace(/\/$/, '') === '/api/admin/users') return deny(request, 404, 'Not found');
  if (accountPages.includes(pathname)) return Response.redirect(new URL('/', request.url).href, 302);
  if (isLocal(request, b)) return null;
  if (mode === 'access') {
    const issuer = b.ACCESS_TEAM_DOMAIN?.trim()
      ? new URL(b.ACCESS_TEAM_DOMAIN.startsWith('https://') ? b.ACCESS_TEAM_DOMAIN : 'https://' + b.ACCESS_TEAM_DOMAIN).origin
      : null;
    const audience = b.APP_ACCESS_AUD?.trim();
    if (!issuer || !audience) return deny(request, 503, 'Cổng vào chưa được cấu hình.');
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token || !(await verifyAccessUser(token, issuer, audience, keyResolver))) return deny(request, 403, 'Cần đăng nhập qua cổng của gia đình.');
    return null;
  }
  // Shared passphrase: a plain HTML form (no app assets needed) and its POST are open without the house cookie.
  if (pathname === '/household' && request.method === 'GET') return passphrasePage('');
  if (pathname === '/api/household' && request.method === 'POST') return acceptPassphrase(request, b);
  const house = await verifyValue(b.PROFILE_COOKIE_SECRET, readCookie(request.headers.get('cookie'), HOUSE_COOKIE));
  if (house?.startsWith('house:') && Number(house.slice(6)) > Date.now()) return null;
  if (pathname.startsWith('/api/')) return deny(request, 401, 'Cần mật khẩu gia đình.');
  return Response.redirect(new URL('/household', request.url).href, 302);
}

function passphrasePage(message: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Learning Hub</title><main style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem"><h1>Learning Hub</h1><form method="post" action="/api/household"><label>Mật khẩu gia đình<br><input type="password" name="passphrase" autocomplete="current-password" required style="width:100%;padding:.5rem;margin:.5rem 0"></label><button style="padding:.5rem 1rem">Vào</button></form>${message ? `<p role="alert">${message}</p>` : ''}</main></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
async function acceptPassphrase(request: Request, b: HouseholdBindings) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin ||
      !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return passphrasePage('Yêu cầu không hợp lệ.', 403);
  const expected = b.HOUSEHOLD_PASSPHRASE_SHA256?.trim().toLowerCase();
  if (!b.PROFILE_COOKIE_SECRET || b.PROFILE_COOKIE_SECRET.length < 32 || !expected || !/^[a-f0-9]{64}$/.test(expected)) return passphrasePage('Mật khẩu gia đình chưa được cấu hình.', 503);
  const reader = request.body?.getReader();
  if (!reader) return passphrasePage('Yêu cầu không hợp lệ.', 400);
  const decoder = new TextDecoder();
  let encoded = '', bytes = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > 4096) {
      await reader.cancel();
      return passphrasePage('Yêu cầu quá lớn.', 413);
    }
    encoded += decoder.decode(part.value, { stream: true });
  }
  const given = new URLSearchParams(encoded + decoder.decode()).get('passphrase') ?? '';
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(given))), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
  if (!given || !sameText(digest, expected)) {
    await new Promise((r) => setTimeout(r, 800));
    return passphrasePage('Mật khẩu chưa đúng.', 401);
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': cookie(HOUSE_COOKIE, await signValue(b.PROFILE_COOKIE_SECRET, 'house:' + (Date.now() + 365 * 86400000)), 365 * 86400),
      'Cache-Control': 'no-store',
    },
  });
}
