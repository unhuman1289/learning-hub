import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

export function runLocalD1(args) {
  const result = spawnSync(process.execPath, [
    resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', ...args,
    '--local', '--persist-to', '.wrangler/state', '--config', 'wrangler.local.json',
  ], {stdio:'inherit', env:{...process.env,
    WRANGLER_LOG_PATH:resolve('.wrangler/logs'), WRANGLER_WRITE_LOGS:'false',
    WRANGLER_SEND_METRICS:'false', CLOUDFLARE_CF_FETCH_ENABLED:'false',
    WRANGLER_REGISTRY_PATH:resolve('.wrangler/dev-registry'),
    MINIFLARE_REGISTRY_PATH:resolve('.wrangler/registry'),
  }});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Local D1 command failed');
}
if(process.argv[2]==='migrate')runLocalD1(['migrations','apply','learning-hub']);
