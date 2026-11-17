export { TutorRelay } from './tutor-relay';
import { authorizeAutomation } from '../lib/auth/automation';
import planPrompt from '../integrations/runner-prompts/plan-request.md?raw';
import assessPrompt from '../integrations/runner-prompts/assess-local.md?raw';
import recheckPrompt from '../integrations/runner-prompts/assess-recheck.md?raw';
import { consumeOpenAi, redispatchOpenAi } from './openai-queue';
import { checkNightlyCoverage } from '../lib/roadmap/coverage';
import { berlinDay } from '../lib/daily-policy';
import handler from "vinext/server/fetch-handler";
import { hub2Guard, standaloneRequestGuard } from "./worker-boundary";
import { createStoredBackup } from "../lib/backup-store";
import { berlinBackupDay, isBerlinBackupTime } from "../lib/backup-schedule.mjs";

import { expireAttachments, refreshSkills } from "../lib/learner-model/nightly";
import { queueDaily } from "../lib/ai-jobs/queue";
import { isBerlinPlanTime } from "../lib/plan-schedule.mjs";
import { maintainJobs } from "../lib/ai-jobs/lease";
import { sendAlertDigest } from "../lib/alerts";
import directMcp from './direct-mcp-worker';
import {isDirectMcpRoute, isMcpAccountSignIn} from './mcp-routing';
import {householdGuard, householdMode} from '../lib/household';

const berlinHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" });

/** Each step runs on its own, so one failure (daily cap, CPU, D1) never skips the steps after it. */
async function runSteps(steps: [string, () => Promise<unknown>][]) {
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      console.error(`Scheduled step ${name} failed:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Plans run at Berlin midnight; maintenance and the 03:00 backup stay separate.
 */
function hub2Steps(db: D1Database, env: Cloudflare.Env, at: Date): [string, () => Promise<unknown>][] {
  if(at.getUTCMinutes()!==0)return [];
  switch (berlinHour.format(at)) {
    case "00":
      return isBerlinPlanTime(at)?[["maintain jobs", () => maintainJobs(db, at)], ["queue daily plans", () => queueDaily(db, env, at)], ["check roadmap sources", () => checkNightlyCoverage(db, berlinDay(at))]]:[];
    case "04":
      return [["refresh skills", () => refreshSkills(db, at)], ["expire attachments", () => expireAttachments(db, at)]];
    case "05":
      return [["refresh skills", () => refreshSkills(db, at)]];
    case "06":
      return [["maintain jobs", () => maintainJobs(db, at)], ["alert digest", () => sendAlertDigest(db, env, at)]];
    default:
      return [];
  }
}

export default {
  queue(batch: MessageBatch<{ jobId?: string }>, env: Cloudflare.Env) {
    return consumeOpenAi(batch, env, (kind, purpose) =>
      kind === 'plan' ? planPrompt : purpose === 'recheck' ? assessPrompt + '\n\n' + recheckPrompt : assessPrompt);
  },
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const guarded = standaloneRequestGuard(request, env) ?? hub2Guard(request, env);
    if (guarded) return guarded;
    if (new URL(request.url).pathname === '/api/automation/v2/tutor/connect') {
      if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, {status:400});
      if (!env.TUTOR_RELAY || env.ENVIRONMENT === 'production') return new Response(null, {status:404});
      const auth = await authorizeAutomation(request, env, 'tutor:answer');
      if ('response' in auth) return auth.response;
      const stub = env.TUTOR_RELAY.get(env.TUTOR_RELAY.idFromName('tutor'), {locationHint:'weur'});
      return stub.fetch('https://tutor.internal/connect', {headers:{Upgrade:'websocket', 'X-Tutor-Session':JSON.stringify({learners:auth.client.learnerIds})}});
    }
    const direct = isDirectMcpRoute(request) || (householdMode(env) && isMcpAccountSignIn(request));
    // MCP/OAuth keeps its own token and account checks, independent of the household profile.
    if (direct) return directMcp.fetch(request, env as Parameters<typeof directMcp.fetch>[1], !!householdMode(env));
    return (await householdGuard(request, env)) ?? handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    const scheduledAt = new Date(controller.scheduledTime);
    if (controller.cron === '*/5 * * * *') {
      ctx.waitUntil(redispatchOpenAi(env, scheduledAt));
      return;
    }
    if (env.HUB2_ENABLED === "true" && env.DB) {
      const steps = hub2Steps(env.DB, env, scheduledAt);
      if (steps.length) ctx.waitUntil(runSteps(steps));
    }
    if (scheduledAt.getUTCMinutes()!==0||!isBerlinBackupTime(scheduledAt)) return;
    if (!env.DB || !env.BUCKET) throw new Error("Staging backup requires D1 and R2 bindings.");

    const day = berlinBackupDay(scheduledAt);
    ctx.waitUntil(createStoredBackup(env.DB, env.BUCKET, {
      environment: env.ENVIRONMENT ?? "unknown",
      deploymentId: env.DEPLOYMENT_ID ?? "learning-hub",
      createdBy: "system:scheduled",
      now: scheduledAt,
      backupId: `daily-${day}`,
    }));
  },
};
