const base = process.argv[2];
if (!base) throw new Error('Pass a local Worker URL, for example http://127.0.0.1:5273.');
const url = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('This pre-open security smoke is limited to loopback.');

async function request(path, options) {
  return fetch(new URL(path, url), { redirect: 'manual', ...options });
}
const health = await request('/api/health');
const body = await health.json();
if (health.status !== 200 || body.status !== 'ok' || body.environment !== 'local' || body.d1 !== 'connected') {
  throw new Error(`Local Worker health/D1 failed (${health.status}).`);
}
const home = await request('/');
if (home.status < 300 || home.status >= 400 || !home.headers.get('location')?.includes('/login')) {
  throw new Error(`Anonymous home did not redirect to login (${home.status}).`);
}
for (const path of ['/login', '/register', '/forgot-password', '/reset-password']) {
  const page = await request(path);
  if (page.status !== 200) throw new Error(`${path} is unavailable (${page.status}).`);
}

const origin = url.origin;
const forged = { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'forged@example.invalid' };
const checks = [
  ['GET /api/state', '/api/state', { headers: forged }],
  ['GET /api/daily', '/api/daily', { headers: forged }],
  ['GET /api/export', '/api/export', { headers: forged }],
  ['GET /api/admin/users', '/api/admin/users', { headers: forged }],
  ['PUT /api/state', '/api/state', { method: 'PUT', headers: { ...forged, origin, 'Content-Type': 'application/json' }, body: '{}' }],
  ['POST /api/daily', '/api/daily', { method: 'POST', headers: { ...forged, origin, 'Content-Type': 'application/json' }, body: '{}' }],
  ['POST /api/admin/users', '/api/admin/users', { method: 'POST', headers: { ...forged, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'forged' }) }],
  ['POST /api/admin/backup', '/api/admin/backup', { method: 'POST', headers: { ...forged, origin } }],
];
const status = {};
for (const [label, path, options] of checks) {
  const response = await request(path, options);
  if (response.status !== 401) throw new Error(`${label} returned ${response.status}; expected 401.`);
  status[label] = response.status;
}
for (const method of ['GET', 'POST']) {
  const response = await request('/api/learning-run', { method, headers: { origin, 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
  if (response.status !== 410) throw new Error(`/api/learning-run ${method} returned ${response.status}.`);
}

const publicSignup = await request('/api/auth/sign-up/email', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `open-${Date.now()}@example.invalid`, name: 'Open signup smoke', password: 'Smoke-test-password-2026!' }),
});
if (publicSignup.status !== 200) throw new Error(`Public sign-up returned ${publicSignup.status}; expected 200.`);

const email = 'local@example.test';
const password = 'Local-smoke-password-2026!';
async function auth(path, payload, sessionCookie) {
  return request(`/api/auth/${path}`, {
    method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...(sessionCookie ? { cookie: sessionCookie } : {}) }, body: JSON.stringify(payload),
  });
}
function cookie(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
  if (!values.length) throw new Error('Auth response did not set a session cookie.');
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

const signup = await auth('sign-up/email', { email, name: 'Local smoke', password, callbackURL: '/' });
if (signup.status !== 200) throw new Error(`Local allowed sign-up failed (${signup.status}).`);
let sessionCookie = cookie(signup);
const initialState = await request('/api/state', { headers: { cookie: sessionCookie } });
if (initialState.status !== 200) throw new Error(`Signed-in D1 state read failed (${initialState.status}).`);
const initial = await initialState.json();
const progress = { done: ['smoke-task'], notes: [], logs: [], starts: {}, daily: 240 };
const saved = await request('/api/state', {
  method: 'PUT', headers: { cookie: sessionCookie, origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ revision: initial.revision, data: progress }),
});
if (saved.status !== 200) throw new Error(`Signed-in D1 progress save failed (${saved.status}).`);

const logout = await auth('sign-out', {}, sessionCookie);
if (logout.status !== 200) throw new Error(`Local sign-out failed (${logout.status}).`);
const loggedOutState = await request('/api/state', { headers: { cookie: sessionCookie } });
if (loggedOutState.status !== 401) throw new Error(`Signed-out session still read progress (${loggedOutState.status}).`);

const signin = await auth('sign-in/email', { email, password, callbackURL: '/' });
if (signin.status !== 200) throw new Error(`Local sign-in failed (${signin.status}).`);
sessionCookie = cookie(signin);
const adminUsers = await request('/api/admin/users', { headers: { cookie: sessionCookie } });
const adminUsersBody = await adminUsers.json();
if (adminUsers.status !== 200 || !Array.isArray(adminUsersBody.users)) throw new Error(`Admin pending-user list failed (${adminUsers.status}).`);
const crossOriginApproval = await request('/api/admin/users', {
  method: 'POST', headers: { cookie: sessionCookie, origin: 'https://attacker.example', 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'open-smoke' }),
});
if (crossOriginApproval.status !== 403) throw new Error(`Cross-origin approval returned ${crossOriginApproval.status}; expected 403.`);
const readback = await request('/api/state', { headers: { cookie: sessionCookie } });
const savedState = await readback.json();
if (readback.status !== 200 || savedState.data?.done?.[0] !== 'smoke-task' || savedState.revision !== 1) {
  throw new Error('Progress did not survive logout/sign-in in the local D1 database.');
}
const finalLogout = await auth('sign-out', {}, sessionCookie);
if (finalLogout.status !== 200) throw new Error(`Final local sign-out failed (${finalLogout.status}).`);

console.log(JSON.stringify({
  health: health.status, d1: body.d1, publicAccountPages: 4, anonymousHome: home.status,
  forgedHeaderApiStatus: status, learningRun: 410, publicSignup: publicSignup.status,
  adminPendingUsers: adminUsers.status, crossOriginApproval: crossOriginApproval.status,
  localAuth: { signup: signup.status, saveProgress: saved.status, logout: logout.status, signin: signin.status, readback: readback.status, revision: savedState.revision },
}));
