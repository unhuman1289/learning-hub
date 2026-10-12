import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuredDatabase, readActiveAdminId, readAndCompareSnapshot } from './d1-remote.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), list[index + 1]]);
  return pairs;
}, []));
if (!['staging','production'].includes(args.env) || !args.file || !args.confirm) {
  throw new Error('Usage: node scripts/d1-verify.mjs --env staging|production --file private-data/sites-export.json --confirm <configured database name>');
}
const database = configuredDatabase(args.env);
if (args.confirm !== database) throw new Error('Database confirmation does not match the Wrangler staging configuration.');
const legacyOwnerId = readActiveAdminId(args.env, database);
const snapshot = JSON.parse(readFileSync(resolve(args.file), 'utf8'));
const comparison = readAndCompareSnapshot(args.env, database, snapshot,{legacyOwnerId});
if (comparison.some((table) => !table.ok)) {
  console.error(JSON.stringify(comparison));
  throw new Error('D1 differs from the Sites snapshot. Output contains counts only; no row values were printed.');
}
console.log(JSON.stringify({ environment: args.env, database, result: 'verified', tables: comparison.map(({ table, expected, actual }) => ({ table, expected, actual })) }, null, 2));
