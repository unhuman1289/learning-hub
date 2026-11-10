// Engines are pure functions: prompt and context in, one JSON object out. They never receive Hub credentials.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJsonReply, strictSchema, stripOptionalNulls } from './schema.mjs';

/** Child processes get the environment without anything that looks like a Hub secret. */
export function childEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !/^HUB_|^CF_ACCESS|BEARER|SECRET/i.test(k)));
}

function run(bin, args, { input, cwd, timeoutMs, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-2000)));
    child.on('error', (e) => (clearTimeout(timer), reject(e)));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(Error(bin + ' exited ' + (signal ?? code) + (stderr ? ': ' + stderr.split('\n').filter(Boolean).slice(-1)[0] : '')));
    });
    child.stdin.end(input);
  });
}

/** Qwen (or any model) behind LM Studio / llama-server's OpenAI-compatible API on localhost. */
export function qwenEngine({
  baseUrl = 'http://127.0.0.1:1234/v1',
  model,
  vision = false,
  fetcher = fetch,
  timeoutMs = 10 * 60000,
  maxTokens = 12000,
}) {
  const url = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) throw Error('The local model server must listen on localhost.');
  return {
    name: 'qwen',
    vision,
    async available() {
      try {
        const r = await fetcher(url.href.replace(/\/$/, '') + '/models', { signal: AbortSignal.timeout(3000) });
        return r.ok;
      } catch {
        return false;
      }
    },
    async run({ system, user, schema, images = [] }) {
      const started = Date.now();
      const content = [
        { type: 'text', text: user },
        ...images.map((img) => ({ type: 'image_url', image_url: { url: 'data:' + img.mime + ';base64,' + img.bytes.toString('base64') } })),
      ];
      const response = await fetcher(url.href.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: images.length ? content : user },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'result', schema } },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw Error('Local model HTTP ' + response.status);
      const body = await response.json();
      const choice = body.choices?.[0];
      if (choice?.finish_reason === 'length') throw Error('Local model ran out of tokens.');
      return {
        // With a schema, LM Studio may return the JSON in reasoning_content when the model runs in thinking mode.
        json: parseJsonReply(choice?.message?.content?.trim() ? choice.message.content : choice?.message?.reasoning_content),
        usage: {
          model: 'local:' + model,
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
          ms: Date.now() - started,
        },
      };
    },
  };
}

/** Codex CLI signed in with the family's ChatGPT plan: `codex exec` with a JSON Schema for the final message. */
export function codexEngine({ bin = 'codex', model, timeoutMs = 20 * 60000, runner = run, env = process.env }) {
  return {
    name: 'codex',
    vision: true,
    async available() {
      try {
        await runner(bin, ['--version'], { input: '', timeoutMs: 10000, env: childEnv(env) });
        return true;
      } catch {
        return false;
      }
    },
    async run({ system, user, schema, images = [] }) {
      const started = Date.now();
      const dir = await mkdtemp(join(tmpdir(), 'lh-codex-'));
      try {
        await writeFile(join(dir, 'schema.json'), JSON.stringify(strictSchema(schema)));
        const files = [];
        for (const [i, img] of images.entries()) {
          const file = join(dir, 'image-' + i + (img.mime === 'image/png' ? '.png' : img.mime === 'image/webp' ? '.webp' : '.jpg'));
          await writeFile(file, img.bytes);
          files.push('-i', file);
        }
        const args = [
          'exec',
          '--skip-git-repo-check',
          '--ephemeral',
          '--sandbox',
          'read-only',
          '--output-schema',
          join(dir, 'schema.json'),
          '-o',
          join(dir, 'out.json'),
          ...(model ? ['-m', model] : []),
          ...files,
          '-',
        ];
        await runner(bin, args, { input: system + '\n\n' + user, cwd: dir, timeoutMs, env: childEnv(env) });
        const json = stripOptionalNulls(schema, parseJsonReply(await readFile(join(dir, 'out.json'), 'utf8')));
        return { json, usage: { model: 'codex:' + (model ?? 'default'), inputTokens: 0, outputTokens: 0, ms: Date.now() - started } };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Claude Code in print mode with tools disabled, as a backup when Codex is unavailable. */
export function claudeEngine({ bin = 'claude', model, timeoutMs = 20 * 60000, runner = run, env = process.env }) {
  return {
    name: 'claude',
    vision: false,
    async available() {
      try {
        await runner(bin, ['--version'], { input: '', timeoutMs: 10000, env: childEnv(env) });
        return true;
      } catch {
        return false;
      }
    },
    async run({ system, user, schema }) {
      const started = Date.now();
      const dir = await mkdtemp(join(tmpdir(), 'lh-claude-'));
      try {
        // Print mode writes the reply to stdout.
        const chunks = [];
        await new Promise((resolve, reject) => {
          const child = spawn(
            bin,
            ['-p', '--output-format', 'text', '--tools', '', ...(model ? ['--model', model] : []), '--append-system-prompt', system],
            { cwd: dir, env: childEnv(env), stdio: ['pipe', 'pipe', 'pipe'] },
          );
          const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
          child.stdout.on('data', (d) => chunks.push(d));
          child.on('error', (e) => (clearTimeout(timer), reject(e)));
          child.on('close', (code) => (clearTimeout(timer), code === 0 ? resolve() : reject(Error('claude exited ' + code))));
          child.stdin.end(user + '\n\nJSON Schema của kết quả:\n' + JSON.stringify(schema) + '\n\nChỉ trả về đúng một đối tượng JSON.');
        });
        const json = stripOptionalNulls(schema, parseJsonReply(Buffer.concat(chunks).toString('utf8')));
        return { json, usage: { model: 'claude:' + (model ?? 'default'), inputTokens: 0, outputTokens: 0, ms: Date.now() - started } };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
