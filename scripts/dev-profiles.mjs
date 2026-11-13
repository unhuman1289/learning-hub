import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import './wrangler-env.mjs';

const config = JSON.parse(readFileSync('.wrangler/demo-runner.json', 'utf8'));
const client = {
  id: 'local-runner',
  accessClientId: 'local-demo-only',
  keySha256: config.keySha256 ?? config.client.keySha256,
  scopes: ['jobs:plan', 'jobs:assess'],
  learnerIds: ['demo-ech'],
  purposes: ['request', 'submission', 'recheck'],
  triggers: ['on_demand', 'deferred'],
};
const args = [
  'node_modules/wrangler/bin/wrangler.js', 'dev',
  '--config', 'dist/server/wrangler.json',
  '--local', '--persist-to', '.wrangler/state-demo',
  '--ip', '127.0.0.1', '--port', '5174', '--inspector-port', '0',
  '--var', 'HOUSEHOLD_GATE:passphrase',
  '--var', 'HOUSEHOLD_LEGACY_PROFILE_IDS:demo-admin,demo-adult,demo-ech',
  '--var', 'PROFILE_COOKIE_SECRET:' + config.cookieSecret,
  '--var', 'AUTOMATION_CLIENTS:' + JSON.stringify([client]),
];
const server = spawn(process.execPath, args, { stdio: 'inherit' });
server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on('exit', code => { process.exitCode = code ?? 1; });
