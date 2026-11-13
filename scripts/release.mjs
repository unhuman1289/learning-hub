import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function checkRelease(environment = 'production') {
  const marker = environment === 'staging' ? '.staging-checkout' : '.release-checkout';
  if (!existsSync(marker)) throw Error('Run this from the dedicated release checkout.');
  if (git('status', '--porcelain')) throw Error('The release checkout has uncommitted changes.');
  const tags = git('tag', '--points-at', 'HEAD').split('\n').filter(tag => /^prod-\d{8}-\d+$/.test(tag));
  if (tags.length !== 1) throw Error('HEAD must point to exactly one prod-YYYYMMDD-N tag.');
  git('merge-base', '--is-ancestor', 'HEAD', 'origin/main');
  return tags[0];
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(command + ' failed: ' + args.join(' '));
}

const stagingOrigin = 'https://learning-hub-staging.tranvu-812.workers.dev';
const wranglerPath = 'node_modules/wrangler/bin/wrangler.js';

function wrangler(args) {
  run(process.execPath, ['--import', './scripts/wrangler-env.mjs', wranglerPath, ...args]);
}

function prepare(environment) {
  const tag = checkRelease(environment);
  run('npm', ['ci']);
  for (const script of ['test', 'typecheck', 'lint', 'contracts:check']) {
    run('npm', ['run', script]);
  }
  run('npm', ['run', 'build'], { ...process.env, CLOUDFLARE_ENV: environment });
  wrangler(['d1', 'migrations', 'list', 'DB', '--env', environment, '--remote']);
  console.log('Verified release candidate ' + tag + ' for ' + environment + '.');
  return tag;
}

function checkoutTag(tag) {
  if (!/^prod-\d{8}-\d+$/.test(tag ?? '')) throw Error('Expected a prod-YYYYMMDD-N tag.');
  if (!existsSync('.staging-checkout') || existsSync('.release-checkout') || git('status', '--porcelain')) {
    throw Error('Use a separate staging checkout marked .staging-checkout with a clean working tree.');
  }
  run('git', ['fetch', 'origin', 'main', 'refs/tags/' + tag + ':refs/tags/' + tag]);
  git('merge-base', '--is-ancestor', 'refs/tags/' + tag, 'origin/main');
  run('git', ['switch', '--detach', 'refs/tags/' + tag]);
}

async function staging(tag, applyMigrations) {
  checkoutTag(tag);
  if (prepare('staging') !== tag) throw Error('Unexpected release tag.');
  const file = 'dist/server/wrangler.json';
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (config.name !== 'learning-hub-staging' || config.vars?.ENVIRONMENT !== 'staging' ||
      config.vars?.APP_ORIGIN !== stagingOrigin ||
      config.d1_databases?.find(binding => binding.binding === 'DB')?.database_name !== 'learning-hub-staging') {
    throw Error('Build did not target the staging Worker and database.');
  }
  config.vars.APP_VERSION = tag;
  writeFileSync(file, JSON.stringify(config));
  if (!applyMigrations) {
    console.log('Preparation complete. Use --apply-migrations to release this tag after migration review.');
    return;
  }
  wrangler(['d1', 'migrations', 'apply', 'DB', '--env', 'staging', '--remote']);
  wrangler(['deploy', '--config', file]);
  const url = new URL('/api/health', stagingOrigin);
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    const health = await response?.json().catch(() => null);
    if (response?.ok && health?.environment === 'staging' && health?.version === tag && health?.d1 === 'connected') {
      run(process.execPath, ['scripts/staging-smoke.mjs', stagingOrigin]);
      console.log('Staging is serving ' + tag + '.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw Error('Staging health did not confirm ' + tag + '. Check the deployment before retrying.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [action, environment, ...options] = process.argv.slice(2);
    if (action === 'staging' && options.every(option => option === '--apply-migrations')) await staging(environment, options.includes('--apply-migrations'));
    else if (action === 'check') console.log(checkRelease());
    else if (action === 'prepare' && ['staging', 'production'].includes(environment)) prepare(environment);
    else throw Error('Usage: node scripts/release.mjs check | prepare <staging|production> | staging <tag> [--apply-migrations]');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
