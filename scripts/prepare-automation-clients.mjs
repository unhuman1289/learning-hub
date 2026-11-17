// Writes the AUTOMATION_CLIENTS secret, the home-runner config and the Sites bridge secrets for one Hub origin.
// node scripts/prepare-automation-clients.mjs --origin https://learn.unhuman.cc --access-id <id> --access-secret-file <file> --profiles <id,id>
// Bearers are generated here; only their sha256 goes into AUTOMATION_CLIENTS. All files are written with mode 600
// under private-data/ (git-ignored) and ~/.config/learning-hub/. Never paste their contents into chat.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2),
  arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const origin = arg('--origin'),
  accessId = arg('--access-id'),
  secretFile = arg('--access-secret-file'),
  profiles = (arg('--profiles') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
if (!['https://learn.unhuman.cc', 'https://learning-hub-staging.tranvu-812.workers.dev'].includes(origin))
  throw Error('--origin must be learn.unhuman.cc or staging');
if (!/^[A-Za-z0-9.-]{8,128}$/.test(accessId ?? '')) throw Error('--access-id is the Cloudflare Access service token Client ID');
if (!secretFile) throw Error('--access-secret-file: a file holding only the service token Client Secret');
if (!profiles.length || profiles.some((p) => !/^[A-Za-z0-9_-]{1,128}$/.test(p))) throw Error('--profiles: comma-separated profile (user) ids');
const accessSecret = readFileSync(secretFile, 'utf8').trim();
const env = origin.includes('staging') ? 'staging' : 'production';

const bearer = (id) => {
  const secret = randomBytes(40).toString('base64url');
  return { token: `lhk_${id}_${secret}`, hash: createHash('sha256').update(secret).digest('hex') };
};
const runner = bearer('home-runner'),
  bridge = bearer('chatgpt-bridge');
const clients = [
  {
    id: 'home-runner',
    keySha256: runner.hash,
    accessClientId: accessId,
    scopes: ['jobs:assess', 'jobs:plan', 'attachments:read', 'history:read', ...(env === 'staging' ? ['tutor:answer'] : [])],
    purposes: ['submission', 'recheck', 'request', 'initial', 'daily'],
    triggers: ['on_demand', 'deferred', 'scheduled'],
    learnerIds: profiles,
  },
  {
    id: 'chatgpt-bridge',
    keySha256: bridge.hash,
    accessClientId: accessId,
    scopes: ['jobs:plan', 'history:read'],
    purposes: ['daily', 'initial', 'request'],
    triggers: ['scheduled', 'deferred', 'on_demand'],
    learnerIds: profiles,
  },
];
const write = (file, text) => writeFileSync(file, text, { mode: 0o600 });
mkdirSync('private-data', { recursive: true });
write(`private-data/automation-clients-${env}.json`, JSON.stringify(clients));
write(
  `private-data/sites-bridge-${env}-secrets.json`,
  JSON.stringify(
    {
      HUB_BRIDGE_ORIGIN: origin,
      HUB_BRIDGE_BEARER: bridge.token,
      HUB_BRIDGE_ACCESS_CLIENT_ID: accessId,
      HUB_BRIDGE_ACCESS_CLIENT_SECRET: accessSecret,
    },
    null,
    2,
  ),
);
const dir = join(homedir(), '.config/learning-hub');
mkdirSync(dir, { recursive: true });
write(
  join(dir, 'home-runner.env'),
  [
    `HUB_BASE_URL=${origin}`,
    `HUB_BEARER=${runner.token}`,
    `HUB_ACCESS_CLIENT_ID=${accessId}`,
    `HUB_ACCESS_CLIENT_SECRET=${accessSecret}`,
    'QWEN_BASE_URL=http://127.0.0.1:1234/v1',
    'QWEN_MODEL=qwen/qwen3.6-35b-a3b',
    'QWEN_VISION=0',
    'CODEX_BIN=codex',
    'CODEX_MODEL=gpt-6.1-sol',
    'CLAUDE_ENABLED=0',
    'RUNNER_DAILY=1',
    'DRIVE_MIRROR_DIR=',
    `DRIVE_MIRROR_PROFILES=${profiles.join(',')}`,
    '',
  ].join('\n'),
);
console.log(
  `Wrote private-data/automation-clients-${env}.json, private-data/sites-bridge-${env}-secrets.json and ~/.config/learning-hub/home-runner.env (mode 600).`,
);
