import assert from "node:assert/strict";
import test from "node:test";
import { memoryDb } from "./d1-adapter.mjs";
import { readRum, recordRum } from "../lib/rum.ts";
import { rumMaxSamples } from "../lib/rum-contract.ts";
import { backupColumns, snapshotRowsForTarget } from "../lib/backup-contract.mjs";

const sample = { screen: "first_question", ms: 100, connection: "3g", device: "phone" };
const request = (body, cf = { country: "VN", colo: "SGN" }) => Object.assign(
  new Request("https://example.test/api/rum", { method: "POST", body }),
  { cf },
);

test("strict beacon schema rejects content and IDs, including in mixed batches", async () => {
  for (const key of ["content", "answer", "lessonId", "country", "colo"]) {
    const result = await readRum(request(JSON.stringify([sample, { ...sample, [key]: "extra" }])));
    assert.equal(result.status, 400, key);
  }
  const unknown = await readRum(request(JSON.stringify({ ...sample, screen: "other" })));
  assert.deepEqual(unknown.samples, []);
  assert.equal((await readRum(request(JSON.stringify({ ...sample, screen: "other", content: "extra" })))).status, 400);
  assert.equal((await readRum(request(JSON.stringify({ ...sample, ms: -1 })))).status, 400);
  const accepted = await readRum(request(JSON.stringify(sample)));
  assert.deepEqual(accepted, { status: 204, samples: [sample], country: "VN", colo: "SGN" });
  assert.equal((await readRum(request(JSON.stringify(sample), {}))).country, "XX");
});

test("beacon size is bounded with and without Content-Length", async () => {
  const json = JSON.stringify(sample);
  assert.equal((await readRum(request(json.padEnd(2048)))).status, 204);
  assert.equal((await readRum(request(json.padEnd(2049)))).status, 413);
  const oversized = request(json);
  oversized.headers.set("Content-Length", "2049");
  assert.equal((await readRum(oversized)).status, 413);
  assert.equal((await readRum(request(JSON.stringify(Array(rumMaxSamples + 1).fill(sample))))).status, 413);
});

test("daily nearest-rank percentiles merge distributions across concurrent batches", async () => {
  const db = memoryDb();
  const now = new Date("2026-11-14T23:10:00Z");
  async function write(values, country = "VN", device = "phone", at = now) {
    const report = await readRum(request(JSON.stringify(values.map(ms => ({ ...sample, ms, device }))), { country }));
    await recordRum(db, report, at);
  }
  await Promise.all([write([100, 200, 300, 400]), write([400, 500, 1_000, 2_000, 9_000])]);
  await write([8_000], "DE");
  await write([700], "VN", "computer");
  await write([900], "VN", "phone", new Date("2026-11-14T22:59:59Z"));
  const rows = db.sqlite.prepare("SELECT * FROM perf_daily ORDER BY day, country, device").all().map(row => ({ ...row }));
  assert.deepEqual(rows.map(({ day, country, device, n, p50, p75, p95 }) => [day, country, device, n, p50, p75, p95]), [
    ["2026-11-14", "VN", "phone", 1, 900, 900, 900],
    ["2026-11-15", "DE", "phone", 1, 8_000, 8_000, 8_000],
    ["2026-11-15", "VN", "computer", 1, 700, 700, 700],
    ["2026-11-15", "VN", "phone", 9, 400, 1_000, 9_000],
  ]);
  assert.deepEqual(Object.keys(rows[0]), backupColumns.perf_daily);
  assert.deepEqual(snapshotRowsForTarget({ format: 4, tables: {} }, "perf_daily"), []);
});
