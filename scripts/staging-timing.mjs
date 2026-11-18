const origin = 'https://learning-hub-staging.tranvu-812.workers.dev';
const passphrase = process.env.STAGING_HOUSEHOLD_PASSPHRASE;
const profileId = process.env.STAGING_TIMING_PROFILE_ID;
if (!passphrase || !profileId) throw Error('Configure STAGING_HOUSEHOLD_PASSPHRASE and STAGING_TIMING_PROFILE_ID in the staging environment.');

// Keep the session in memory; never log credentials, cookies or response bodies.
const gate = await fetch(origin + '/api/household', { method: 'POST', redirect: 'manual',
  headers: { Origin: origin }, body: new URLSearchParams({ passphrase }) });
if (![302, 303].includes(gate.status)) throw Error(`Household login failed (${gate.status}).`);
const cookies = gate.headers.getSetCookie().map(value => value.split(';')[0]);
if (!cookies.length) throw Error('Household login did not return a session.');
const profile = await fetch(origin + '/api/profiles', { method: 'POST', redirect: 'manual',
  headers: { Origin: origin, Cookie: cookies.join('; '), 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'select', id: profileId }) });
if (!profile.ok) throw Error(`Profile selection failed (${profile.status}).`);
cookies.push(...profile.headers.getSetCookie().map(value => value.split(';')[0]));
if (cookies.length < 2) throw Error('Profile selection did not return a session.');

const samples = { app: [], d1: [] };
for (let i = 1; i <= 5; i++) {
  const response = await fetch(origin + '/api/today', { redirect: 'manual', headers: { Cookie: cookies.join('; ') } });
  if (!response.ok) throw Error(`/api/today sample ${i} failed (${response.status}).`);
  const header = response.headers.get('server-timing') ?? '';
  for (const metric of Object.keys(samples)) {
    const value = header.match(new RegExp(`(?:^|,)\\s*${metric}\\s*;\\s*dur=(\\d+(?:\\.\\d+)?)\\s*(?:,|$)`));
    if (!value) throw Error(`/api/today sample ${i} is missing ${metric} timing.`);
    samples[metric].push(Number(value[1]));
  }
  console.log(`Sample ${i}: app=${samples.app.at(-1)} ms, d1=${samples.d1.at(-1)} ms`);
  await response.body?.cancel();
}
const median = values => [...values].sort((a, b) => a - b)[2];
console.log(`Median: app=${median(samples.app)} ms, d1=${median(samples.d1)} ms (n=5)`);
