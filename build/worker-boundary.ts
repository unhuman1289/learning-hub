/** Hub 2 APIs answer only where Hub 2 is switched on; elsewhere they do not exist. */
const hub2Prefixes = ["/api/lessons", "/api/submissions", "/api/attempts", "/api/disputes", "/api/requests", "/api/quality", "/api/skills", "/api/today", "/api/uploads", "/api/admin/ai-jobs", "/api/admin/alerts", "/api/admin/lessons", "/api/admin/quality", "/api/runner-status", "/api/history"];

export function hub2Guard(request: Request, env: { HUB2_ENABLED?: string }): Response | null {
  if (env.HUB2_ENABLED === "true") return null;
  const { pathname } = new URL(request.url);
  if (!hub2Prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))) return null;
  return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export function standaloneRequestGuard(request: Request, env: Pick<Cloudflare.Env, "ENVIRONMENT" | "STAGING_SPIKE_LOCKDOWN">): Response | null {
  const { pathname } = new URL(request.url);

  // The old scheduled endpoint relies on Sites' dispatch boundary. It must
  // never be reachable from an independent Worker deployment.
  if (pathname === "/api/learning-run") {
    return Response.json(
      { error: "This endpoint is not available on standalone Workers." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  // workers.dev is public. Until standalone authentication is complete,
  // staging exposes only a neutral probe page and the D1 health check. This
  // also blocks direct requests for bundled JS that contains curriculum data.
  if (env.ENVIRONMENT === "staging" && env.STAGING_SPIKE_LOCKDOWN === "true") {
    if (pathname === "/api/health" && request.method === "GET") return null;
    if (pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Learning Hub staging</title><main><h1>Learning Hub staging</h1><p>Worker and D1 probe is online. The learning app stays private until sign-in is ready.</p></main></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return null;
}
