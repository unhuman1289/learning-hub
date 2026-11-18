import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const config = '.wrangler/demo-runner.json';
const hash = value => createHash('sha256').update(value).digest('hex');
if (!existsSync(config)) {
  const key = randomBytes(32).toString('hex');
  mkdirSync('.wrangler', { recursive: true });
  writeFileSync(config, JSON.stringify({
    bearer: 'Bearer lhk_local-runner_' + key,
    keySha256: hash(key),
    expectedLearnerRef: 'lrn_' + hash('local:demo-ech').slice(0, 12),
    cookieSecret: randomBytes(32).toString('hex'),
  }), { mode: 0o600, flag: 'wx' });
}
console.log('Local demo configuration ready.');
