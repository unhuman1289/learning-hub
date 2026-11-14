import { accessSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { runLocalD1 } from '../../scripts/local-db.mjs';

const state = process.env.LEARNING_HUB_DEMO_STATE;
if (!state?.startsWith('.wrangler/e2e-')) throw new Error('Expected an isolated local E2E database.');
accessSync('dist/server/wrangler.json');
process.env.LEARNING_HUB_LOCAL_STATE = state;
// The fixture starts with several open lessons. Give the fake runner room for one more.
runLocalD1(['execute', 'learning-hub', '--command',
  "UPDATE learner_settings SET daily_target_minutes=120 WHERE user_id='demo-ech'"]);
const child = spawn(process.execPath, ['scripts/dev-profiles.mjs'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
