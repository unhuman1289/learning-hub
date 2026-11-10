import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type AutomationScope = 'runs:create' | 'context:read' | 'result:write' | 'jobs:plan' | 'jobs:assess' | 'attachments:read';
export type AutomationClient = {
  id: string;
  keySha256: string;
  scopes: AutomationScope[];
  accessClientId: string;
  learnerIds?: string[];
  purposes?: string[];
  triggers?: string[];
};
export type AutomationBindings = {
  ACCESS_TEAM_DOMAIN?: string;
  AUTOMATION_ACCESS_AUD?: string;
  AUTOMATION_CLIENTS?: string;
  APP_ENV?: string;
  ENVIRONMENT?: string;
};

const scopeSet = new Set<AutomationScope>(['runs:create', 'context:read', 'result:write','jobs:plan','jobs:assess','attachments:read']);
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const noStore = { 'Cache-Control': 'no-store' };

function failure(status: number, error: string) {
  return Response.json({ error }, { status, headers: noStore });
}

function parseIssuer(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.startsWith('https://') ? value : `https://${value}`);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.cloudflareaccess.com') || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseClients(value: string | undefined): AutomationClient[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 32) return null;
    const seen = new Set<string>();
    const clients: AutomationClient[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || !/^[A-Za-z0-9-]{3,64}$/.test(row.id) || seen.has(row.id)) return null;
      if (typeof row.keySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.keySha256)) return null;
      if (typeof row.accessClientId !== 'string' || !/^[A-Za-z0-9.-]{8,128}$/.test(row.accessClientId)) return null;
      if (!Array.isArray(row.scopes) || row.scopes.some((scope) => typeof scope !== 'string' || !scopeSet.has(scope as AutomationScope))) return null;
      if(row.purposes !== undefined && (!Array.isArray(row.purposes)||row.purposes.some(p=>!['daily','initial','request','submission','recheck'].includes(p as string))))return null;
      if(row.triggers !== undefined && (!Array.isArray(row.triggers)||row.triggers.some(p=>!['scheduled','on_demand','deferred'].includes(p as string))))return null;
      if(row.learnerIds !== undefined && (!Array.isArray(row.learnerIds)||row.learnerIds.length>32||row.learnerIds.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x))))return null;
      seen.add(row.id);
      clients.push({ id: row.id, keySha256: row.keySha256, scopes: row.scopes as AutomationScope[], accessClientId: row.accessClientId, learnerIds:row.learnerIds as string[]|undefined,purposes: row.purposes as string[]|undefined, triggers:row.triggers as string[]|undefined });
    }
    return clients;
  } catch {
    return null;
  }
}

function equalHash(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return mismatch === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function accessKeySet(issuer: string) {
  let keySet = jwksByIssuer.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));
    jwksByIssuer.set(issuer, keySet);
  }
  return keySet;
}

export async function verifyAccessAssertion(
  token: string,
  expected: { issuer: string; audience: string; clientId: string },
  keyResolver: JWTVerifyGetKey = accessKeySet(expected.issuer),
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer: expected.issuer,
      audience: expected.audience,
      algorithms: ['RS256'],
      clockTolerance: 5,
    });
    // Cloudflare service JWTs use an empty subject and common_name client ID.
    // service_token_status belongs to identity responses and is not always in JWTs.
    return payload.type === 'app'
      && payload.sub === ''
      && (payload.service_token_status === undefined || payload.service_token_status === true)
      && payload.common_name === expected.clientId
      && typeof payload.exp === 'number'
      && payload.exp > nowSeconds
      && typeof payload.iat === 'number'
      && payload.iat <= nowSeconds + 5;
  } catch {
    return false;
  }
}

export type AutomationAuthorization = { client: AutomationClient } | { response: Response };

export async function authorizeAutomation(
  request: Request,
  bindings: AutomationBindings,
  scope: AutomationScope,
  keyResolver?: JWTVerifyGetKey,
): Promise<AutomationAuthorization> {
  const issuer = parseIssuer(bindings.ACCESS_TEAM_DOMAIN);
  const audience = bindings.AUTOMATION_ACCESS_AUD?.trim();
  const clients = parseClients(bindings.AUTOMATION_CLIENTS);
  const local = scope.startsWith('jobs:') && bindings.APP_ENV === 'local' && bindings.ENVIRONMENT === 'local' && new URL(request.url).hostname === 'localhost';
  if ((!local && (!issuer || !audience)) || !clients) return { response: failure(503, 'Automation authorization is not configured.') };

  const auth = request.headers.get('authorization') ?? '';
  const match = /^Bearer lhk_([A-Za-z0-9-]{3,64})_([A-Za-z0-9._~-]{32,256})$/.exec(auth);
  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (!match || (!local && !assertion)) return { response: failure(401, 'Automation credentials are required.') };

  const client = clients.find((candidate) => candidate.id === match[1]);
  if (!client || !equalHash(client.keySha256, await sha256Hex(match[2]))) return { response: failure(401, 'Automation credentials are invalid.') };
  if (!local && !await verifyAccessAssertion(assertion!, { issuer:issuer!, audience:audience!, clientId: client.accessClientId }, keyResolver)) {
    return { response: failure(401, 'Automation credentials are invalid.') };
  }
  if (!client.scopes.includes(scope)) return { response: failure(403, 'Automation client lacks the required permission.') };
  return { client };
}
