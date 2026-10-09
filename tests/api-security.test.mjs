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
  const files = routeFiles();
  assert.ok(files.length > 0);

  for (const file of files) {
    const name = relative(apiRoot, file).replaceAll('\\', '/');
    const source = readFileSync(file, 'utf8');
    if (publicRoutes.has(name)) continue;
    if (disabledRoutes.has(name)) {
      assert.match(source, /standalone Workers|independent\/public Worker|Sites dispatch\s+boundary/i, `${name} must document its mandatory Worker boundary`);
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
