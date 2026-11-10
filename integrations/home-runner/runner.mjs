#!/usr/bin/env node
// Learning Hub home runner: asks the Hub for work every 15 s by day (5 min at night), one job at a time.
// Start: node --experimental-strip-types integrations/home-runner/runner.mjs [--once] [--config <file>]
import { execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createHub } from './hub.mjs';
import { claudeEngine, codexEngine, qwenEngine } from './engines.mjs';
import { processJob } from './job.mjs';
import { mirrorDue, mirrorHistory } from './mirror.mjs';

export const VERSION = '1.0.0';

/** KEY=VALUE lines; # comments. The file must not be readable by others. */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function loadConfig(file = join(homedir(), '.config/learning-hub/home-runner.env'), env = process.env) {
  let fromFile = {};
  try {
    fromFile = parseEnvFile(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    ...fromFile,
    ...Object.fromEntries(
      Object.entries(env).filter(
        ([k]) =>
          k.startsWith('HUB_') ||
          k.startsWith('QWEN_') ||
          k.startsWith('CODEX_') ||
          k.startsWith('CLAUDE_') ||
          k.startsWith('RUNNER_') ||
          k.startsWith('DRIVE_'),
      ),
    ),
  };
}

const berlinMinutes = (now) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now)
    .split(':');
  return Number(h) * 60 + Number(m);
};
/** 06:00–23:30 Berlin: every 15 s; otherwise every 5 minutes. */
export function pollDelay(now = new Date(), { dayMs = 15000, nightMs = 300000 } = {}) {
  const m = berlinMinutes(now);
  return m >= 360 && m < 1410 ? dayMs : nightMs;
}

export async function onACPower(exec = promisify(execFile)) {
  if (process.platform !== 'darwin') return true;
  try {
    return /AC Power/.test((await exec('pmset', ['-g', 'batt'])).stdout);
  } catch {
    return true;
  }
}

/** Purposes to ask for, given which engines answer right now. */
export function leaseRequest(available, onAC) {
  const grader = (available.qwen && onAC) || available.codex || available.claude;
  const writer = available.codex || available.claude;
  const purposes = [...(grader ? ['submission'] : []), ...(writer ? ['recheck', 'request', 'initial'] : [])];
  const kinds = [...(purposes.some((p) => p === 'submission' || p === 'recheck') ? ['assess'] : []), ...(writer ? ['plan'] : [])];
  const vision = !!(available.codex || (available.qwen && onAC && available.qwenVision));
  return purposes.length
    ? {
        kinds,
        purposes,
        triggers: ['on_demand', 'deferred'],
        max: 1,
        capabilities: vision ? ['vision'] : [],
        runner: {
          name: 'home-runner',
          version: VERSION,
          model: Object.keys(available)
            .filter((k) => available[k] && k !== 'qwenVision')
            .join('+'),
        },
      }
    : null;
}

const log = (entry) => console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));

export async function runOnce(hub, engines, { power = onACPower } = {}) {
  const onAC = await power();
  const available = {
    qwen: engines.qwen ? await engines.qwen.available() : false,
    qwenVision: !!engines.qwen?.vision,
    codex: engines.codex ? await engines.codex.available() : false,
    claude: engines.claude ? await engines.claude.available() : false,
  };
  const request = leaseRequest(available, onAC);
  if (!request) return { idle: true, reason: 'no_engine' };
  const [lease] = await hub.lease(request);
  if (!lease) return { idle: true };
  // Keep the Mac awake while a job runs; caffeinate exits with this process.
  const awake = process.platform === 'darwin' ? spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }) : null;
  try {
    return await processJob(
      hub,
      lease,
      { qwen: available.qwen ? engines.qwen : null, codex: available.codex ? engines.codex : null, claude: available.claude ? engines.claude : null },
      { onAC, log },
    );
  } finally {
    awake?.kill();
  }
}

export function buildFromConfig(config) {
  const hub = createHub({
    baseUrl: config.HUB_BASE_URL,
    bearer: config.HUB_BEARER,
    accessClientId: config.HUB_ACCESS_CLIENT_ID,
    accessClientSecret: config.HUB_ACCESS_CLIENT_SECRET,
  });
  const off = (v) => v === '0' || v === 'off' || v === 'false';
  const engines = {
    qwen: off(config.QWEN_ENABLED)
      ? null
      : qwenEngine({ baseUrl: config.QWEN_BASE_URL, model: config.QWEN_MODEL ?? 'qwen/qwen3.6-35b-a3b', vision: config.QWEN_VISION === '1' }),
    codex: off(config.CODEX_ENABLED) ? null : codexEngine({ bin: config.CODEX_BIN ?? 'codex', model: config.CODEX_MODEL || 'gpt-6.1-sol' }),
    claude: off(config.CLAUDE_ENABLED ?? '0') ? null : claudeEngine({ bin: config.CLAUDE_BIN ?? 'claude', model: config.CLAUDE_MODEL || undefined }),
  };
  return { hub, engines };
}

async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig(args.includes('--config') ? args[args.indexOf('--config') + 1] : undefined);
  const { hub, engines } = buildFromConfig(config);
  let stop = false,
    backoff = 0,
    mirroredDay = null;
  const mirror = {
    dir: config.DRIVE_MIRROR_DIR,
    learnerIds: (config.DRIVE_MIRROR_PROFILES ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => (stop = true));
  log({ event: 'start', version: VERSION, hub: new URL(config.HUB_BASE_URL).origin });
  while (!stop) {
    let delay;
    try {
      const day = mirror.dir ? mirrorDue(mirroredDay) : null;
      if (day) {
        await mirrorHistory(hub, mirror, log);
        mirroredDay = day;
      }
      const outcome = await runOnce(hub, engines);
      if (!outcome.idle) log({ event: 'job', ...outcome });
      backoff = 0;
      delay = outcome.idle ? pollDelay() : 1000;
    } catch (error) {
      backoff = Math.min(backoff ? backoff * 2 : 15000, 300000);
      delay = backoff;
      log({ event: 'error', message: error instanceof Error ? error.message : String(error), retryInMs: delay });
    }
    if (args.includes('--once')) break;
    await new Promise((r) => setTimeout(r, delay));
  }
  log({ event: 'stop' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
