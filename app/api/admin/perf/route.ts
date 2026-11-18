import { storage } from "../../../../db/storage";
import { apiFailure } from "../../../../lib/api-error";
import { getHubUser } from "../../../../lib/auth/session";
import { privateHeaders } from "../../../../lib/lesson-v2/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getHubUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401, headers: privateHeaders });
  if (user.role !== "admin") return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });

  try {
    const { results } = await storage().prepare(`
      SELECT day, country, screen, device, n, p75
      FROM perf_daily
      WHERE day = (SELECT MAX(day) FROM perf_daily)
      ORDER BY country, screen, device
    `).all();
    return Response.json({ rows: results }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, "Chưa tải được số đo tốc độ.", privateHeaders);
  }
}
