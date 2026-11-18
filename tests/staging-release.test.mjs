import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const commit = 'a'.repeat(40);
const release = new URL('../scripts/release.mjs', import.meta.url);
const hubOrigin = 'https://learning-hub-staging.tranvu-812.workers.dev';

function fakeRelease(t, { applyMigrations, mcpCommit = commit }) {
  const cwd = mkdtempSync(join(tmpdir(), 'hub-staging-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (path, contents, mode) => writeFileSync(join(cwd, path), contents, { mode });
  for (const directory of ['bin', 'scripts', 'dist/server', 'node_modules/wrangler/bin']) {
    mkdirSync(join(cwd, directory), { recursive: true });
  }
  write('.staging-checkout', '');
  write('calls', '');
  write('dist/server/wrangler.json', JSON.stringify({
    name: 'learning-hub-staging',
    vars: { ENVIRONMENT: 'staging', APP_ORIGIN: hubOrigin, APP_COMMIT: commit, APP_VERSION: commit.slice(0, 12) },
    d1_databases: [{ binding: 'DB', database_name: 'learning-hub-staging' }],
  }));

  write('bin/git', `#!/bin/sh
case "$1" in
  rev-parse|for-each-ref) echo '${commit}' ;;
  status|fetch|switch) exit 0 ;;
  *) exit 1 ;;
esac
`, 0o755);
  write('bin/npm', '#!/bin/sh\nprintf "npm %s\\n" "$*" >> calls\n', 0o755);
  const append = "import { appendFileSync } from 'node:fs';\n";
  write('node_modules/wrangler/bin/wrangler.js', append +
    "appendFileSync('calls', 'wrangler ' + process.argv.slice(2).join(' ') + '\\n');");
  write('scripts/wrangler-env.mjs', '');
  write('scripts/staging-smoke.mjs', append + "appendFileSync('calls', 'smoke\\n');");
  write('mock-health.mjs', append + `
    globalThis.setTimeout = (callback) => queueMicrotask(callback);
    globalThis.fetch = async (url) => {
      appendFileSync('calls', 'GET ' + url + '\\n');
      if (url.href === '${hubOrigin}/api/health') {
        return Response.json({ environment: 'staging', commit: '${commit}', d1: 'connected' });
      }
      if (url.href === 'https://learning-hub-mcp-staging.tranvu-812.workers.dev/api/health') {
        return Response.json({ environment: 'staging', commit: '${mcpCommit}' });
      }
      throw new Error('Unexpected fetch: ' + url);
    };
  `);

  const result = spawnSync(process.execPath, [
    '--import', './mock-health.mjs', fileURLToPath(release), 'staging', commit,
    ...(applyMigrations ? ['--apply-migrations'] : []),
  ], { cwd, encoding: 'utf8', env: { PATH: join(cwd, 'bin') }, timeout: 10_000 });
  assert.ifError(result.error);
  return { ...result, calls: readFileSync(join(cwd, 'calls'), 'utf8').trim().split('\n') };
}

test('staging preparation stops before deployments and health checks', t => {
  const result = fakeRelease(t, { applyMigrations: false });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(-1), [
    'wrangler d1 migrations list DB --config wrangler.jsonc --env staging --remote',
  ]);
});

test('staging deploys Hub and MCP before confirming the same commit on both Workers', t => {
  const result = fakeRelease(t, { applyMigrations: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(-6), [
    'wrangler d1 migrations apply DB --config wrangler.jsonc --env staging --remote',
    'wrangler deploy --config dist/server/wrangler.json',
    'npm run deploy:mcp:staging -- --var APP_COMMIT:' + commit,
    'GET ' + hubOrigin + '/api/health',
    'GET https://learning-hub-mcp-staging.tranvu-812.workers.dev/api/health',
    'smoke',
  ]);
});

test('staging rejects an MCP Worker that still serves an older commit', t => {
  const result = fakeRelease(t, { applyMigrations: true, mcpCommit: 'b'.repeat(40) });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /MCP staging health did not confirm/);
  assert.ok(!result.calls.includes('smoke'));
});
