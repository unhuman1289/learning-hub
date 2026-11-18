import tutorPrompt from '../integrations/runner-prompts/tutor.md?raw';
import planPrompt from '../integrations/runner-prompts/plan-request.md?raw';
import assessPrompt from '../integrations/runner-prompts/assess-openai.md?raw';
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
import { enqueueCalibration } from '../lib/calibration/jobs';
import { isBerlinCalibrationTime } from '../lib/calibration-schedule.mjs';
import { isBerlinPlanTime } from "../lib/plan-schedule.mjs";
import { applyPreparedDaily } from '../lib/ai-jobs/result';
import { aiSubjects } from '../lib/ai-controls';
import { maintainJobs } from "../lib/ai-jobs/lease";
import { sendAlertDigest } from "../lib/alerts";
import directMcp from './direct-mcp-worker';
import {isDirectMcpRoute, isMcpAccountSignIn} from './mcp-routing';
import {householdGuard, householdMode} from '../lib/household';
import {tutorSprite} from '../lib/tutor/sprite';

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
      return isBerlinPlanTime(at)?[["apply prepared plans", async () => applyPreparedDaily(db, at, env.AI_PRICE_TABLE, env.UPLOADS, env.OPENAI_API_KEY && env.UPLOADS ? await aiSubjects(db, env, true) : [])], ["maintain jobs", () => maintainJobs(db, at)], ["queue daily plans", () => queueDaily(db, env, at)], ["check roadmap sources", () => checkNightlyCoverage(db, berlinDay(at))]]:[];
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
  queue(batch: MessageBatch<{ jobId?: string; tutorTurnId?: string; calibrationJobId?: string }>, env: Cloudflare.Env) {
    return consumeOpenAi(batch, env, (kind, purpose) =>
      kind === 'plan' ? planPrompt : purpose === 'recheck' ? assessPrompt + '\n\n' + recheckPrompt : assessPrompt, fetch, tutorPrompt);
  },
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const guarded = standaloneRequestGuard(request, env) ?? hub2Guard(request, env);
    if (guarded) return guarded;
    const direct = isDirectMcpRoute(request) || (householdMode(env) && isMcpAccountSignIn(request));
    // MCP/OAuth keeps its own token and account checks, independent of the household profile.
    if (direct) return directMcp.fetch(request, env as Parameters<typeof directMcp.fetch>[1], !!householdMode(env));
    const household = await householdGuard(request, env);
    if (household) return household;
    if (new URL(request.url).pathname.startsWith('/api/tutor/sprite/')) {
      if (!householdMode(env)) return new Response(null, {status: 404});
      return tutorSprite(request, env.UPLOADS);
    }
    return handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    const scheduledAt = new Date(controller.scheduledTime);
    if (controller.cron === '*/5 * * * *') {
      ctx.waitUntil(redispatchOpenAi(env, scheduledAt));
      if (env.HUB2_ENABLED === 'true' && env.DB && isBerlinCalibrationTime(scheduledAt))
        ctx.waitUntil(enqueueCalibration(env.DB, env, 'weekly:' + berlinDay(scheduledAt), scheduledAt));
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
