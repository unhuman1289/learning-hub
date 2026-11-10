const base = process.argv[2] ?? process.env.STAGING_URL;
const locked = process.argv.includes('--locked');
if (!base) throw new Error('Pass the staging workers.dev URL.');

const url = new URL(base);
if (!url.hostname.endsWith('.workers.dev') || url.hostname === 'learn.unhuman.cc') {
  throw new Error('The staging smoke test only accepts a workers.dev hostname.');
}

async function request(path, options) {
  return fetch(new URL(path, url), { redirect: 'manual', ...options });
}

const health = await request('/api/health');
const healthBody = await health.json();
if (health.status !== 200 || healthBody.status !== 'ok' || healthBody.environment !== 'staging' || healthBody.d1 !== 'connected') {
  throw new Error(`Staging health/D1 check failed (${health.status}).`);
}

const oldRunGet = await request('/api/learning-run');
const oldRunPost = await request('/api/learning-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
if (oldRunGet.status !== 410 || oldRunPost.status !== 410) throw new Error('The legacy Sites endpoint is not disabled.');

if (locked) {
  const home = await request('/');
  const body = await home.text();
  const state = await request('/api/state');
  const asset = await request('/_next/static/vinext-client-entry-manifest.json');
  if (home.status !== 200 || !body.includes('The learning app stays private until sign-in is ready.')) throw new Error('Locked staging page was not served.');
  if (state.status !== 404 || asset.status !== 404) throw new Error('Locked staging exposed a private route or app assets.');
  console.log(JSON.stringify({ mode: 'locked', url: url.origin, health: health.status, d1: healthBody.d1, learningRun: [oldRunGet.status, oldRunPost.status], state: state.status, clientManifest: asset.status }));
  process.exit(0);
}

const home = await request('/');
if (home.status < 300 || home.status >= 400 || !home.headers.get('location')?.includes('/login')) {
  throw new Error(`Anonymous home request did not redirect to login (${home.status}).`);
}

const pages = {};
for (const path of ['/login', '/register', '/forgot-password', '/reset-password']) {
  const response = await request(path);
  if (response.status !== 200) throw new Error(`${path} is unavailable (${response.status}).`);
  pages[path] = response.status;
}

const loginHtml = await (await request('/login')).text();
const stylesheetPaths = [...loginHtml.matchAll(/href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map((match) => match[1]);
if (stylesheetPaths.length === 0) throw new Error('Login page did not include a stylesheet.');
let stylesheetLoaded = false;
for (const path of stylesheetPaths) {
  const response = await request(path);
  const css = await response.text();
  if (response.status === 200 && response.headers.get('content-type')?.includes('text/css') && css.includes('.account-card')) {
    stylesheetLoaded = true;
    break;
  }
}
if (!stylesheetLoaded) throw new Error('Login stylesheet is missing, has the wrong content type, or does not contain account styles.');

const accountFormScript = [...loginHtml.matchAll(/(?:src|href)=["']([^"']*account-form-[^"']+\.js(?:\?[^"']*)?)["']/g)]
  .map((match) => match[1])[0];
if (!accountFormScript) throw new Error('Login page did not include the interactive account form script.');
const accountFormResponse = await request(accountFormScript);
if (accountFormResponse.status !== 200 || !accountFormResponse.headers.get('content-type')?.includes('javascript')) {
  throw new Error(`Account form script is missing or has the wrong content type (${accountFormResponse.status}).`);
}

const forged = {
  'oai-authenticated-user-id': 'forged-user',
  'oai-authenticated-user-email': 'forged@example.invalid',
};
const origin = url.origin;
const protectedChecks = [
  ['GET /api/lessons/id','/api/lessons/les_aaaaaaaaaaaaaaaaaaaa',{headers:forged}],
  ['PUT lesson draft','/api/lessons/les_aaaaaaaaaaaaaaaaaaaa/draft',{method:'PUT',headers:{...forged,origin,'Content-Type':'application/json'},body:'{}'}],
  ['POST lesson reveal','/api/lessons/les_aaaaaaaaaaaaaaaaaaaa/items/i1/reveal',{method:'POST',headers:{...forged,origin,'Content-Type':'application/json'},body:'{}'}],
  ['POST lesson submission','/api/lessons/les_aaaaaaaaaaaaaaaaaaaa/submissions',{method:'POST',headers:{...forged,origin,'Content-Type':'application/json'},body:'{}'}],
  ['PUT lesson completion','/api/lessons/les_aaaaaaaaaaaaaaaaaaaa/completion',{method:'PUT',headers:{...forged,origin,'Content-Type':'application/json'},body:'{}'}],
  ['GET submission','/api/submissions/subm_aaaaaaaaaaaaaaaaaaaa',{headers:forged}],
  ['GET subject lessons','/api/subjects/sub_aaaaaaaaaaaaaaaaaaaa/lessons',{headers:forged}],
  ['POST admin import','/api/admin/lessons/import',{method:'POST',headers:{...forged,origin,'Content-Type':'application/json'},body:'{}'}],

  ['GET /api/state', '/api/state', { headers: forged }],
  ['GET /api/daily', '/api/daily', { headers: forged }],
  ['GET /api/export', '/api/export', { headers: forged }],
  ['GET /api/admin/users', '/api/admin/users', { headers: forged }],
  ['PUT /api/state', '/api/state', { method: 'PUT', headers: { ...forged, origin, 'Content-Type': 'application/json' }, body: '{}' }],
  ['POST /api/daily', '/api/daily', { method: 'POST', headers: { ...forged, origin, 'Content-Type': 'application/json' }, body: '{}' }],
  ['POST /api/admin/users', '/api/admin/users', { method: 'POST', headers: { ...forged, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'forged' }) }],
  ['POST /api/admin/backup', '/api/admin/backup', { method: 'POST', headers: { ...forged, origin } }],
];
const protectedStatus = {};
for (const [label, path, options] of protectedChecks) {
  const response = await request(path, options);
  if (response.status !== 401) throw new Error(`${label} returned ${response.status} to an unauthenticated forged-header request.`);
  protectedStatus[label] = response.status;
}

console.log(JSON.stringify({
  mode: 'open', url: url.origin, health: health.status, d1: healthBody.d1,
  pages, stylesheetLoaded, anonymousHome: home.status, legacyLearningRun: [oldRunGet.status, oldRunPost.status],
  accountFormScriptLoaded: true,
  forgedIdentityApiStatus: protectedStatus,
}));
