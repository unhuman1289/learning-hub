import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const version = env.APP_VERSION ?? "unknown";
  const commit = env.APP_COMMIT ?? null;
  const environment = env.ENVIRONMENT ?? "unknown";

  try {
    if (!env.DB) throw new Error("D1 binding missing");
    const result = await env.DB.prepare("SELECT 1 AS ready").first<{ ready: number }>();
    if (result?.ready !== 1) throw new Error("D1 check failed");
    return Response.json({ status: "ok", environment, version, commit, d1: "connected" }, { headers });
  } catch {
    return Response.json(
      { status: "error", environment, version, commit, d1: "unavailable" },
      { status: 503, headers },
    );
  }
}
