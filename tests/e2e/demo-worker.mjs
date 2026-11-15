import { accessSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import '../../scripts/wrangler-env.mjs';
import { AUDIO, LISTENING_LESSON, VOICE_HASHES } from './fixtures/listening.mjs';
import { runLocalD1 } from '../../scripts/local-db.mjs';

const state = process.env.LEARNING_HUB_DEMO_STATE;
if (!state?.startsWith('.wrangler/e2e-')) throw new Error('Expected an isolated local E2E database.');
accessSync('dist/server/wrangler.json');
process.env.LEARNING_HUB_LOCAL_STATE = state;
// The fixture starts with several open lessons. Give the fake runner room for one more.
runLocalD1(['execute', 'learning-hub', '--command',
  "UPDATE learner_settings SET daily_target_minutes=120 WHERE user_id='demo-ech'"]);
if (process.env.E2E_LISTENING === '1') {
  const fixture = 'tests/e2e/fixtures/listening-demo.m4a';
  const key = 'audio/e2e-listening.m4a';
  const upload = spawnSync(process.execPath, [
    'node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'put', 'learning-hub-uploads-local/' + key,
    '--file', fixture, '--local', '--persist-to', state, '--config', 'wrangler.jsonc',
  ], { stdio: 'inherit' });
  if (upload.error) throw upload.error;
  if (upload.status !== 0) throw Error('Could not seed listening audio.');
  const { f, m, next } = VOICE_HASHES;
  const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'";
  const rows = [f, m, next].map(hash =>
    `('${hash}','de-DE',1,'{}',4939,${statSync(fixture).size},'${key}','e2e','2026-11-15T00:00:00Z')`);
  const audio = { ...AUDIO, hashF: f, hashM: m, durationMs: 4939 };
  runLocalD1(['execute', 'learning-hub', '--command', `
    INSERT INTO audio_assets(hash,lang,rate,voices,duration_ms,bytes,r2_key,created_job_id,created_at)
      VALUES ${rows.join(',')};
    UPDATE lesson_items SET stimulus='audio',audio_hash_f='${f}',audio_hash_m='${m}',
      payload=json_set(payload,'$.audio',json(${quote(audio)}),'$.prompt','Bạn nghe thấy họ hẹn nhau lúc nào?')
      WHERE lesson_id='${LISTENING_LESSON}' AND item_id='i1';
    UPDATE lesson_items SET stimulus='audio',audio_hash_f='${next}',audio_hash_m='${m}',
      payload=json_set(payload,'$.audio',json(${quote({ ...audio, hashF: next })}))
      WHERE lesson_id='${LISTENING_LESSON}' AND item_id='i2';
  `]);
}
const child = spawn(process.execPath, ['scripts/dev-profiles.mjs'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
