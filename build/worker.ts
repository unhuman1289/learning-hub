import handler from "vinext/server/fetch-handler";
import { standaloneRequestGuard } from "./worker-boundary";
import { createStoredBackup } from "../lib/backup-store";
import { berlinBackupDay, isBerlinBackupTime } from "../lib/backup-schedule.mjs";

import {refreshSkills} from '../lib/learner-model/nightly';
import {queueDaily} from '../lib/ai-jobs/queue';
import {maintainJobs} from '../lib/ai-jobs/lease';
import {sendAlertDigest} from '../lib/alerts';
export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const guarded = standaloneRequestGuard(request, env);
    if (guarded) return guarded;
    return handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    const scheduledAt = new Date(controller.scheduledTime);
    const hour = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(scheduledAt);
    if(env.HUB2_ENABLED === 'true' && env.DB && ['03','06'].includes(hour)){
      ctx.waitUntil((async()=>{await maintainJobs(env.DB!,scheduledAt);if(hour==='03'){await refreshSkills(env.DB!,scheduledAt);await queueDaily(env.DB!,env,scheduledAt);}await sendAlertDigest(env.DB!,env,scheduledAt);})());
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
