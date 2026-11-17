// Diagnostic wrapper: capture Wrangler debug output and file metadata, never file contents.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [label, ...command] = process.argv.slice(2);
if (!label || !command.length) throw Error('Expected label and command');
if (process.env.E2E_DIAG !== '1') {
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} else {
  const dir = join('private-data', 'e2e-diagnostics', label);
  await mkdir(dir, { recursive: true });
  async function snapshot(root) {
    const files = {};
    async function visit(path) {
      let entries;
      try { entries = await readdir(path, { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      for (const entry of entries) {
        const name = join(path, entry.name);
        if (entry.isDirectory()) await visit(name);
        else if (entry.isFile()) {
          try { const info = await stat(name); files[name] = { mtimeMs: info.mtimeMs, size: info.size }; }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
    }
    await visit(root);
    return files;
  }
  const startedAt = new Date().toISOString();
  const before = { dist: await snapshot('dist'), wrangler: await snapshot('.wrangler') };
  const log = createWriteStream(join(dir, 'wrangler-debug.log'));
  const child = spawn(command[0], command.slice(1), { env: { ...process.env, WRANGLER_LOG: 'debug', E2E_DIAG_LABEL: label }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream.on('data', chunk => { output.write(chunk); log.write(chunk); });
  }
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code ?? 1)); });
  await new Promise(resolve => log.end(resolve));
  const after = { dist: await snapshot('dist'), wrangler: await snapshot('.wrangler') };
  const changes = {};
  for (const root of ['dist', 'wrangler']) {
    changes[root] = Object.fromEntries([...new Set([...Object.keys(before[root]), ...Object.keys(after[root])])].sort()
      .filter(name => JSON.stringify(before[root][name]) !== JSON.stringify(after[root][name]))
      .map(name => [name, { before: before[root][name] ?? null, after: after[root][name] ?? null }]));
  }
  await writeFile(join(dir, 'file-changes.json'), JSON.stringify({ startedAt, completedAt: new Date().toISOString(), changes }, null, 2));
  process.exitCode = code;
}
