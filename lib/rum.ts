import { berlinDay } from "./daily-policy.ts";
import {
  rumConnections, rumDevices, rumMaxMs, rumMaxSamples, rumScreens, type RumSample,
} from "./rum-contract.ts";

const maxBytes = 2048;
const sampleKeys = ["screen", "ms", "connection", "device"];

async function readBody(request: Request): Promise<{ status: 200; value: unknown } | { status: 400 | 413 }> {
  if (Number(request.headers.get("content-length")) > maxBytes) return { status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 };
  const bytes = new Uint8Array(maxBytes);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > maxBytes) {
        void reader.cancel().catch(() => {});
        return { status: 413 };
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
    return { status: 200, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))) };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function validShape(value: unknown): value is Omit<RumSample, "screen"> & { screen: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).length !== sampleKeys.length || !sampleKeys.every(key => Object.hasOwn(value, key))) return false;
  const sample = value as RumSample;
  return typeof sample.screen === "string" && typeof sample.ms === "number" && Number.isFinite(sample.ms)
    && sample.ms >= 0 && sample.ms <= rumMaxMs
    && rumConnections.includes(sample.connection) && rumDevices.includes(sample.device);
}

export async function readRum(request: Request) {
  const body = await readBody(request);
  if (body.status !== 200) return body;
  const values: unknown[] = Array.isArray(body.value) ? body.value : [body.value];
  if (values.length > rumMaxSamples) return { status: 413 } as const;
  if (!values.every(validShape)) return { status: 400 } as const;
  const samples = values.filter((sample): sample is RumSample => rumScreens.some(screen => screen === sample.screen))
    .map(sample => ({ ...sample, ms: Math.round(sample.ms) }));
  const { country, colo } = (request as Request & { cf?: { country?: string; colo?: string } }).cf ?? {};
  return {
    status: 204,
    samples,
    country: country && /^[A-Z]{2}$/.test(country) ? country : "XX",
    colo: colo && /^[A-Z]{3}$/.test(colo) ? colo : null,
  } as const;
}

const addCounts = `
  INSERT INTO perf_counts (day, screen, country, device, ms, n)
  SELECT ?1, value ->> 'screen', ?2, value ->> 'device', value ->> 'ms', COUNT(*)
  FROM json_each(?3) GROUP BY 2, 4, 5
  ON CONFLICT(day, screen, country, device, ms) DO UPDATE SET n = n + excluded.n
`;

// Recompute only the groups touched by this beacon. The first value whose
// cumulative count reaches p*n is the nearest-rank percentile for the whole day.
const refreshDaily = `
  WITH touched AS (
    SELECT DISTINCT value ->> 'screen' AS screen, value ->> 'device' AS device FROM json_each(?3)
  ), ranked AS (
    SELECT c.screen, c.device, c.ms,
      SUM(c.n) OVER (PARTITION BY c.screen, c.device ORDER BY c.ms) AS cumulative,
      SUM(c.n) OVER (PARTITION BY c.screen, c.device) AS total
    FROM touched t JOIN perf_counts c ON c.day = ?1 AND c.country = ?2 AND c.screen = t.screen AND c.device = t.device
  )
  INSERT INTO perf_daily (day, screen, country, device, n, p50, p75, p95)
  SELECT ?1, screen, ?2, device, MAX(total),
    MIN(CASE WHEN cumulative * 100 >= total * 50 THEN ms END),
    MIN(CASE WHEN cumulative * 100 >= total * 75 THEN ms END),
    MIN(CASE WHEN cumulative * 100 >= total * 95 THEN ms END)
  FROM ranked GROUP BY screen, device
  ON CONFLICT(day, screen, country, device) DO UPDATE
  SET n = excluded.n, p50 = excluded.p50, p75 = excluded.p75, p95 = excluded.p95
`;

export async function recordRum(db: D1Database, report: Extract<Awaited<ReturnType<typeof readRum>>, { status: 204 }>, now = new Date()) {
  if (!report.samples.length) return;
  const day = berlinDay(now);
  // Keep the previous day's counts for requests in flight across Berlin midnight.
  const yesterday = new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);
  const values = JSON.stringify(report.samples.map(({ screen, device, ms }) => ({ screen, device, ms })));
  // The daily breakdown is by country and device. Colo and connection are transient.
  await db.batch([
    db.prepare(addCounts).bind(day, report.country, values),
    db.prepare(refreshDaily).bind(day, report.country, values),
    db.prepare("DELETE FROM perf_counts WHERE day < ?").bind(yesterday),
  ]);
}
