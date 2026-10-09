import handler from "vinext/server/fetch-handler";
import { standaloneRequestGuard } from "./worker-boundary";
import { createStoredBackup } from "../lib/backup-store";
import { berlinBackupDay, isBerlinBackupTime } from "../lib/backup-schedule.mjs";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const guarded = standaloneRequestGuard(request, env);
    if (guarded) return guarded;
    return handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    const scheduledAt = new Date(controller.scheduledTime);
    if (!isBerlinBackupTime(scheduledAt)) return;
    if (!env.DB || !env.BUCKET) throw new Error("Staging backup requires D1 and R2 bindings.");

    const day = berlinBackupDay(scheduledAt);
    ctx.waitUntil(createStoredBackup(env.DB, env.BUCKET, {
      environment: env.ENVIRONMENT ?? "unknown",
      createdBy: "system:scheduled",
      now: scheduledAt,
      backupId: `daily-${day}`,
    }));
  },
};
