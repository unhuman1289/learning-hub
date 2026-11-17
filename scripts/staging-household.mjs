import { readFileSync } from 'node:fs';

// Never include the passphrase or response bodies in diagnostics.
export async function householdLogin(origin, id) {
  if (origin !== 'https://learning-hub-staging.tranvu-812.workers.dev') throw Error('Household QA login is restricted to staging.');
  const passphrase = readFileSync('private-data/staging-household.txt', 'utf8').replace(/\r?\n$/, '');
  const gate = await fetch(origin + '/api/household', { method: 'POST', redirect: 'manual',
    headers: { Origin: origin }, body: new URLSearchParams({ passphrase }) });
  if (gate.status !== 303 && gate.status !== 302) throw Error('Household login failed (' + gate.status + ').');
  const house = gate.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const profile = await fetch(origin + '/api/profiles', { method: 'POST', headers: { Origin: origin, Cookie: house, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'select', id }) });
  if (!profile.ok) throw Error('Profile selection failed (' + profile.status + ').');
  return [house, ...profile.headers.getSetCookie().map(c => c.split(';')[0])].join('; ');
}
