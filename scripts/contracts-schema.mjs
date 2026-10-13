// Writes the JSON Schema of every contract to contracts/*.schema.json; --check fails when they are stale.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { z } from 'zod/v4';
import { lessonPackageV2 } from '../lib/contracts/lesson-package-v2.ts';

import {planContext,planResult,assessContext,assessResult} from '../lib/contracts/ai-common.ts';
const contracts = { 'lesson-package-v2': lessonPackageV2, 'plan-context-v1':planContext, 'plan-result-v1':planResult, 'assess-context-v1':assessContext, 'assess-result-v1':assessResult };
const check = process.argv.includes('--check');
const dir = new URL('../contracts/', import.meta.url);
mkdirSync(dir, { recursive: true });
let stale = [];
for (const [name, schema] of Object.entries(contracts)) {
  const file = new URL(`${name}.schema.json`, dir);
  const json = JSON.stringify({ $id: `learning-hub/${name}`, ...z.toJSONSchema(schema) }, null, 2) + '\n';
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== json) stale.push(name);
  } else writeFileSync(file, json);
}
if (stale.length) {
  console.error(`Stale contract schema: ${stale.join(', ')}. Run npm run contracts:schema and commit.`);
  process.exit(1);
}
console.log(check ? 'Contract schemas are up to date.' : `Wrote ${Object.keys(contracts).length} contract schema(s).`);
