import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const root = process.cwd();
const configPath = `${root}/wrangler.jsonc`;
const wrangler = `${root}/node_modules/wrangler/bin/wrangler.js`;

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("Cloudflare staging requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.");
}

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(-5).join("\n");
    throw new Error(`Wrangler ${args[0]} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function getDatabases(raw) {
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : parsed.result ?? parsed.databases;
  if (!Array.isArray(rows)) throw new Error("Wrangler D1 list returned an unexpected JSON shape.");
  return rows;
}

function getDatabaseId(row) {
  return row.uuid ?? row.id ?? row.database_id ?? null;
}

let config = JSON.parse(await readFile(configPath, "utf8"));
let databases = getDatabases(runWrangler(["d1", "list", "--json", "--config", configPath]));
const resolved = {};

for (const environment of ["staging", "production"]) {
  const binding = config.env?.[environment]?.d1_databases?.find((entry) => entry.binding === "DB");
  if (!binding) throw new Error(`wrangler.jsonc has no DB binding for ${environment}.`);

  let matches = databases.filter((row) => (row.name ?? row.database_name) === binding.database_name);
  if (matches.length > 1) throw new Error(`More than one D1 database is named ${binding.database_name}.`);

  if (matches.length === 0) {
    runWrangler([
      "d1", "create", binding.database_name,
      "--location", "weur",
      "--binding", "DB",
      "--env", environment,
      "--config", configPath,
      "--update-config",
    ]);
    databases = getDatabases(runWrangler(["d1", "list", "--json", "--config", configPath]));
    matches = databases.filter((row) => (row.name ?? row.database_name) === binding.database_name);
  }

  const id = matches.length === 1 ? getDatabaseId(matches[0]) : null;
  if (!id) throw new Error(`Could not resolve the D1 ID for ${binding.database_name}.`);
  binding.database_id = id;
  resolved[environment] = { name: binding.database_name, id };
}

config.env.staging.vars.APP_VERSION = process.env.GITHUB_SHA ?? "staging-spike";
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ provisioned: resolved }));
