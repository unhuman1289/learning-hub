#!/usr/bin/env node
// Learning Hub home runner: asks the Hub for work every 15 s by day (5 min at night), one job at a time.
// Start: node --experimental-strip-types integrations/home-runner/runner.mjs [--once] [--config <file>]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHub } from './hub.mjs';
import { qwenEngine } from './engines.mjs';
import { processJob } from './job.mjs';
import { mirrorDue, mirrorHistory } from './mirror.mjs';

export const VERSION = '1.5.0';

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

export function leaseRequest(qwen, { daily = false } = {}) {
  return {
    kinds: ['assess', 'plan'],
    purposes: ['submission', 'recheck', 'request', 'initial', ...(daily ? ['daily'] : [])],
    triggers: ['on_demand', 'deferred', ...(daily ? ['scheduled'] : [])],
    max: 1,
    capabilities: ['adaptive-plan', 'local-grading', 'lesson-v3', 'roadmap-v2', ...(qwen.vision ? ['vision'] : [])],
    runner: { name: 'home-runner', version: VERSION, model: 'qwen' },
  };
}

const log = (entry) => console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));

export async function runOnce(hub, qwen, { daily = false } = {}) {
  if (!await qwen.available()) return { idle: true, reason: 'no_engine' };
  const [lease] = await hub.lease(leaseRequest(qwen, { daily }));
  if (!lease) return { idle: true };
  const awake = process.platform === 'darwin' ? spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }) : null;
  try {
    return await processJob(hub, lease, qwen, { log });
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
  const qwen = qwenEngine({
    baseUrl: config.QWEN_BASE_URL,
    model: config.QWEN_MODEL ?? 'qwen/qwen3.6-35b-a3b',
    vision: config.QWEN_VISION === '1',
  });
  return { hub, qwen, daily: config.RUNNER_DAILY !== '0' };
}

async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig(args.includes('--config') ? args[args.indexOf('--config') + 1] : undefined);
  const { hub, qwen, daily } = buildFromConfig(config);
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
      const outcome = await runOnce(hub, qwen, { daily });
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
