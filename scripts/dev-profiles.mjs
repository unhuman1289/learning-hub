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
  purposes: ['initial', 'request', 'submission', 'recheck'],
  triggers: ['on_demand', 'deferred'],
};
const port = process.env.LEARNING_HUB_DEMO_PORT ?? '5174';
const state = process.env.LEARNING_HUB_DEMO_STATE ?? '.wrangler/state-demo';
const args = [
  'node_modules/wrangler/bin/wrangler.js', 'dev',
  '--config', 'dist/server/wrangler.json',
  '--local', '--persist-to', state,
  '--ip', '127.0.0.1', '--port', port, '--inspector-port', '0',
  '--var', 'HOUSEHOLD_GATE:passphrase',
  '--var', 'HOUSEHOLD_LEGACY_PROFILE_IDS:demo-admin,demo-adult,demo-ech',
  '--var', 'PROFILE_COOKIE_SECRET:' + config.cookieSecret,
  '--var', 'GRADER_CLIENT_ID:' + client.id,
  '--var', 'AUTOMATION_CLIENTS:' + JSON.stringify([client]),
];
if (process.env.E2E_AI_CONTROLS === '1') args.push('--var', 'OPENAI_ENABLED:true');
const server = spawn(process.execPath, args, { stdio: 'inherit' });
server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on('exit', code => { process.exitCode = code ?? 1; });
