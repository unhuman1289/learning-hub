import handler from "vinext/server/fetch-handler";
import { hub2Guard, standaloneRequestGuard } from "./worker-boundary";
import { householdGuard } from "../lib/household";
import { createStoredBackup } from "../lib/backup-store";
import { berlinBackupDay, isBerlinBackupTime } from "../lib/backup-schedule.mjs";

import { expireAttachments, refreshSkills } from "../lib/learner-model/nightly";
import { queueDaily } from "../lib/ai-jobs/queue";
import { maintainJobs } from "../lib/ai-jobs/lease";
import { sendAlertDigest } from "../lib/alerts";

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
 * Hub 2 nightly work, spread over the hourly cron (01–05 UTC) because a Free invocation has a small
 * D1 query budget and the 03:00 run also writes the backup. Daily plan jobs are queued first.
 */
function hub2Steps(db: D1Database, env: Cloudflare.Env, at: Date): [string, () => Promise<unknown>][] {
  switch (berlinHour.format(at)) {
    case "03":
      return [["maintain jobs", () => maintainJobs(db, at)], ["queue daily plans", () => queueDaily(db, env, at)]];
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
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const guarded = standaloneRequestGuard(request, env) ?? hub2Guard(request, env) ?? (await householdGuard(request, env));
    if (guarded) return guarded;
    return handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    const scheduledAt = new Date(controller.scheduledTime);
    if (env.HUB2_ENABLED === "true" && env.DB) {
      const steps = hub2Steps(env.DB, env, scheduledAt);
      if (steps.length) ctx.waitUntil(runSteps(steps));
    }
    if (!isBerlinBackupTime(scheduledAt)) return;
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
