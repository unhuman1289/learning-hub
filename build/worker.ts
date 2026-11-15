import { DurableObject } from "cloudflare:workers";
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

// Local-only T0 spike. The runner socket may hibernate between turns.
export class TutorRelay extends DurableObject {
  private readonly instance = crypto.randomUUID();
  private readonly turns = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/connect" && request.headers.get("Upgrade") === "websocket") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server, ["runner"]);
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
      return new Response(null, { status: 101, webSocket: client });
    }
    const [runner] = this.ctx.getWebSockets("runner");
    if (!runner) return new Response("Runner unavailable", { status: 503 });

    const sqlite = this.ctx.storage.sql.exec<{ ready: number }>("SELECT 1 AS ready").one().ready;
    const turnId = crypto.randomUUID();
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.turns.set(turnId, controller);
        runner.send(JSON.stringify({ type: "ask", turnId }));
      },
      cancel: () => { this.turns.delete(turnId); },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-T0-SQLite": String(sqlite), "X-T0-Instance": this.instance },
    });
  }

  webSocketMessage(_runner: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const { type, turnId, text } = JSON.parse(message);
    const controller = this.turns.get(turnId);
    if (!controller) return;
    if (type === "delta") {
      controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));
    }
    if (type === "done") {
      controller.close();
      this.turns.delete(turnId);
    }
  }
}

export default {
  async fetch(request: Request, env: Cloudflare.Env & { TUTOR_RELAY?: DurableObjectNamespace }, ctx: ExecutionContext) {
    const guarded = standaloneRequestGuard(request, env) ?? hub2Guard(request, env);
    if (guarded) return guarded;
    if (env.ENVIRONMENT === "local" && new URL(request.url).pathname === "/api/t0-spike/connect"
        && request.headers.get("Upgrade") === "websocket" && env.TUTOR_RELAY) {
      return env.TUTOR_RELAY.getByName("t0").fetch("https://t0.internal/connect", request);
    }
    const direct = isDirectMcpRoute(request) || (householdMode(env) && isMcpAccountSignIn(request));
    // MCP/OAuth keeps its own token and account checks, independent of the household profile.
    if (direct) return directMcp.fetch(request, env as Parameters<typeof directMcp.fetch>[1], !!householdMode(env));
    return (await householdGuard(request, env)) ?? handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    const scheduledAt = new Date(controller.scheduledTime);
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
