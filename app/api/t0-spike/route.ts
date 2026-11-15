import { env } from "cloudflare:workers";
import { getHubUser } from "../../../lib/auth/session";

export async function GET() {
  const { ENVIRONMENT, TUTOR_RELAY } = env as Cloudflare.Env & { TUTOR_RELAY?: DurableObjectNamespace };
  if (ENVIRONMENT !== "local" || !TUTOR_RELAY) return new Response(null, { status: 404 });
  if (!await getHubUser()) return new Response(null, { status: 401 });
  const response = await TUTOR_RELAY.getByName("t0").fetch("https://t0.internal/stream");
  const headers = new Headers(response.headers);
  headers.set("X-T0-Vinext", "1");
  return new Response(response.body, { status: response.status, headers });
}
