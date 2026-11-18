import { storage } from "../../../db/storage";
import { getHubUser } from "../../../lib/auth/session";
import { readRum, recordRum } from "../../../lib/rum";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const report = await readRum(request);
  if (report.status !== 204 || !report.samples.length) return new Response(null, { status: report.status });
  try {
    if (!await getHubUser()) return new Response(null, { status: 401 });
    await recordRum(storage(), report);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
