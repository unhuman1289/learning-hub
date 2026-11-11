import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../app/api/', import.meta.url));
function routeFiles(directory = apiRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(path) : entry.name === 'route.ts' ? [path] : [];
  });
}

test('every standalone API route is authenticated or explicitly public/disabled', () => {
  const publicRoutes = new Set(['auth/[...all]/route.ts', 'health/route.ts']);
  const disabledRoutes = new Set(['learning-run/route.ts']);
  // Profile choice exists only behind the household gate (lib/household.ts), which runs before the app on every request.
  const householdRoutes = new Set(['profiles/route.ts']);
  const serviceRoutes = new Set([
    'automation/v1/runs/route.ts',
    'automation/v1/runs/[runId]/route.ts',
    'automation/v1/runs/[runId]/context/route.ts',
    'automation/v1/runs/[runId]/result/route.ts',
    'automation/v1/runs/[runId]/fail/route.ts',
    'automation/v1/schema/route.ts',
    'automation/v2/[...path]/route.ts',
  ]);
  const files = routeFiles();
  assert.ok(files.length > 0);

  for (const file of files) {
    const name = relative(apiRoot, file).replaceAll('\\', '/');
    const source = readFileSync(file, 'utf8');
    if (publicRoutes.has(name)) continue;
    if (householdRoutes.has(name)) {
      assert.equal((source.match(/if \(!householdMode\(env\)\)/g) ?? []).length, 2, `${name} must not exist without the household gate`);
      continue;
    }
    if (disabledRoutes.has(name)) {
      assert.match(source, /standalone Workers|independent\/public Worker|Sites dispatch\s+boundary/i, `${name} must document its mandatory Worker boundary`);
      continue;
    }
    if (name === 'profiles/route.ts') {
      assert.match(source, /householdMode\(env\)/);
      const worker = readFileSync(new URL('../build/worker.ts', import.meta.url), 'utf8');
      assert.match(worker, /await householdGuard\(request, env\).*handler.fetch/);
      continue;
    }
    if (serviceRoutes.has(name)) {
      if (name.startsWith('automation/v2/')) {
        assert.match(source, /authorizeAutomation\(req,\s*env,\s*'jobs:plan'\)/);
        assert.match(source, /leasedJob\(db,\s*client,\s*id,\s*token\)/);
        continue;
      }
      assert.match(source, /requireAutomation\(request, '(runs:create|context:read|result:write)'\)/, `${name} must require scoped service authorization`);
      continue;
    }
    assert.match(source, /getHubUser\s*\(/, `${name} must derive identity from an active Hub session`);
  }
});

test('standalone authentication never trusts Sites identity headers', () => {
  const source = [
    readFileSync(new URL('../lib/auth/session.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../lib/auth/runtime.ts', import.meta.url), 'utf8'),
    ...routeFiles().map((file) => readFileSync(file, 'utf8')),
  ].join('\n');
  assert.doesNotMatch(source, /oai-authenticated-user-/i);
  assert.doesNotMatch(source, /getChatGPTUser/);
});

test('daily read and write APIs scope progress to the active session user', () => {
  const route = readFileSync(new URL('../app/api/daily/route.ts', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../lib/daily-view.ts', import.meta.url), 'utf8');
  assert.match(route, /resolveLearner\(storage\(\),user,req,'read_work'\)/);
  assert.match(route, /readDaily\(learnerId,user\.role==='admin'&&learnerId===user\.id\)/);
  assert.match(route, /WHERE user_id=\? AND id=\?/);
  assert.match(route, /WHERE user_id=\? AND lesson_id=\?/);
  assert.match(view, /WHERE l\.user_id=\?/);
  assert.match(view, /s\.user_id=l\.user_id/);
});
