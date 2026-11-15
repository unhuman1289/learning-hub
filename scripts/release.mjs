import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function checkCheckout(environment) {
  const marker = environment === 'staging' ? '.staging-checkout' : '.release-checkout';
  const otherMarker = environment === 'staging' ? '.release-checkout' : '.staging-checkout';
  if (!existsSync(marker) || existsSync(otherMarker)) throw Error('Run this from the dedicated ' + environment + ' checkout.');
  if (git('status', '--porcelain', '--untracked-files=all')) throw Error('The release checkout has uncommitted changes.');
}

export function checkRelease() {
  checkCheckout('production');
  const tags = git('tag', '--points-at', 'HEAD').split('\n').filter(tag => /^prod-\d{8}-\d+$/.test(tag));
  if (tags.length !== 1) throw Error('HEAD must point to exactly one prod-YYYYMMDD-N tag.');
  git('merge-base', '--is-ancestor', 'HEAD', 'origin/main');
  return { commit: git('rev-parse', 'HEAD'), version: tags[0] };
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(command + ' failed: ' + args.join(' '));
}

const stagingOrigin = 'https://learning-hub-staging.tranvu-812.workers.dev';
const stagingMcpOrigin = 'https://learning-hub-mcp-staging.tranvu-812.workers.dev';
const wranglerPath = 'node_modules/wrangler/bin/wrangler.js';

function wrangler(args) {
  run(process.execPath, ['--import', './scripts/wrangler-env.mjs', wranglerPath, ...args]);
}

function prepare(environment, { commit, version }) {
  run('npm', ['ci']);
  for (const script of ['test', 'typecheck', 'lint', 'contracts:check']) {
    run('npm', ['run', script]);
  }
  run('npm', ['run', 'build'], {
    ...process.env,
    CLOUDFLARE_ENV: environment,
    LEARNING_HUB_BUILD_COMMIT: commit,
    LEARNING_HUB_BUILD_VERSION: version,
  });
  wrangler(['d1', 'migrations', 'list', 'DB', '--config', 'wrangler.jsonc', '--env', environment, '--remote']);
  console.log('Prepared ' + version + ' (' + commit + ') for ' + environment + '.');
}

const originBranches = 'refs/learning-hub/origin/heads';
const originTags = 'refs/learning-hub/origin/tags';

function stagingCandidate(target = 'HEAD') {
  checkCheckout('staging');
  run('git', ['fetch', '--prune', '--no-tags', 'origin',
    '+refs/heads/*:' + originBranches + '/*', '+refs/tags/*:' + originTags + '/*']);
  const ref = /^[0-9a-f]{7,40}$/.test(target) || target === 'HEAD'
    ? target : originTags + '/' + target;
  const commit = git('rev-parse', '--verify', '--end-of-options', ref + '^{commit}');
  if (!git('for-each-ref', '--contains', commit, '--format=%(refname)', originBranches, originTags)) {
    throw Error('Commit ' + commit + ' is not reachable from a branch or tag on origin.');
  }
  return { commit, version: commit.slice(0, 12) };
}

async function staging(target, applyMigrations) {
  if (!target) throw Error('Expected a commit or tag.');
  const candidate = stagingCandidate(target);
  run('git', ['switch', '--detach', candidate.commit]);
  checkCheckout('staging');
  prepare('staging', candidate);
  const file = 'dist/server/wrangler.json';
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (config.name !== 'learning-hub-staging' || config.vars?.ENVIRONMENT !== 'staging' ||
      config.vars?.APP_ORIGIN !== stagingOrigin ||
      config.vars?.APP_COMMIT !== candidate.commit || config.vars?.APP_VERSION !== candidate.version ||
      config.d1_databases?.find(binding => binding.binding === 'DB')?.database_name !== 'learning-hub-staging') {
    throw Error('Build did not match the staging Worker, database and commit.');
  }
  if (!applyMigrations) {
    console.log('Preparation complete. Use --apply-migrations to release this commit after migration review.');
    return;
  }
  checkCheckout('staging');
  if (git('rev-parse', 'HEAD') !== candidate.commit) throw Error('The staging checkout moved during preparation.');
  wrangler(['d1', 'migrations', 'apply', 'DB', '--config', 'wrangler.jsonc', '--env', 'staging', '--remote']);
  wrangler(['deploy', '--config', file]);
  run('npm', ['run', 'deploy:mcp:staging', '--', '--var', 'APP_COMMIT:' + candidate.commit]);
  await Promise.all([
    verifyStagingHealth('Hub staging', stagingOrigin, candidate.commit, { d1: 'connected' }),
    verifyStagingHealth('MCP staging', stagingMcpOrigin, candidate.commit),
  ]);
  run(process.execPath, ['scripts/staging-smoke.mjs', stagingOrigin]);
  console.log('Hub and MCP staging are serving ' + candidate.commit + '.');
}

async function verifyStagingHealth(worker, origin, commit, extra = {}) {
  const url = new URL('/api/health', origin);
  const expected = { environment: 'staging', commit, ...extra };
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) }).catch(() => null);
    const health = await response?.json().catch(() => null);
    if (response?.ok && Object.entries(expected).every(([key, value]) => health?.[key] === value)) return;
    if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw Error(worker + ' health did not confirm ' + commit + '. Check the deployment before retrying.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [action, environment, ...options] = process.argv.slice(2);
    if (action === 'staging' && options.every(option => option === '--apply-migrations')) await staging(environment, options.includes('--apply-migrations'));
    else if (action === 'check') console.log(checkRelease().version);
    else if (action === 'prepare' && environment === 'production') prepare(environment, checkRelease());
    else if (action === 'prepare' && environment === 'staging') prepare(environment, stagingCandidate());
    else throw Error('Usage: node scripts/release.mjs check | prepare <staging|production> | staging <commit|tag> [--apply-migrations]');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
