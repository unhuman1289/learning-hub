const base = process.argv[2] ?? process.env.STAGING_URL;
if (!base) throw new Error("Pass a staging workers.dev URL.");

const url = new URL(base);
if (!url.hostname.endsWith(".workers.dev") || url.hostname === "learn.unhuman.cc") {
  throw new Error("The staging smoke test only accepts a workers.dev hostname.");
}

const homeMs = [];
const healthMs = [];
const percentile95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

for (let i = 0; i < 20; i += 1) {
  const homeStart = performance.now();
  const home = await fetch(new URL("/", url));
  const homeBody = await home.text();
  homeMs.push(performance.now() - homeStart);
  if (!home.ok || !homeBody.trim()) throw new Error(`Home request ${i + 1} returned ${home.status}.`);

  const healthStart = performance.now();
  const health = await fetch(new URL("/api/health", url));
  const healthBody = await health.json();
  healthMs.push(performance.now() - healthStart);
  if (!health.ok || healthBody.status !== "ok" || healthBody.environment !== "staging" || healthBody.d1 !== "connected") {
    throw new Error(`Health request ${i + 1} did not confirm staging D1.`);
  }
}

const oldRun = await fetch(new URL("/api/learning-run", url));
if (oldRun.status !== 410) throw new Error(`The Sites learning-run endpoint returned ${oldRun.status}, expected 410.`);
const state = await fetch(new URL("/api/state", url));
if (state.status !== 404) throw new Error(`Staging lockdown returned ${state.status} for /api/state, expected 404.`);

console.log(JSON.stringify({
  url: url.origin,
  requests: { home: homeMs.length, health: healthMs.length },
  status: { home: 200, health: 200, learningRun: oldRun.status, state: state.status },
  latencyMs: {
    homeP95: Number(percentile95(homeMs).toFixed(1)),
    healthP95: Number(percentile95(healthMs).toFixed(1)),
  },
}));
