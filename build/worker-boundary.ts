export function standaloneApiGuard(request: Request, env: Pick<Cloudflare.Env, "ENVIRONMENT" | "STAGING_SPIKE_LOCKDOWN">): Response | null {
  const pathname = new URL(request.url).pathname;

  // The old scheduled endpoint relies on Sites' dispatch boundary. It must
  // never be reachable from an independent Worker deployment.
  if (pathname === "/api/learning-run") {
    return Response.json(
      { error: "This endpoint is not available on standalone Workers." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  // The initial staging spike exposes only the health check; it has no user
  // API or learner data until standalone authentication is verified.
  if (
    env.ENVIRONMENT === "staging" &&
    env.STAGING_SPIKE_LOCKDOWN === "true" &&
    pathname.startsWith("/api/") &&
    pathname !== "/api/health"
  ) {
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return null;
}
