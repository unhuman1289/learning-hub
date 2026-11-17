import { accessSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import '../../scripts/wrangler-env.mjs';
import { ASSISTED_LESSONS, AUDIO, LISTENING_LESSON, VOICE_HASHES } from './fixtures/listening.mjs';
import { runLocalD1 } from '../../scripts/local-db.mjs';

const state = process.env.LEARNING_HUB_DEMO_STATE;
if (!state?.startsWith('.wrangler/e2e-')) throw new Error('Expected an isolated local E2E database.');
accessSync('dist/server/wrangler.json');
process.env.LEARNING_HUB_LOCAL_STATE = state;
runLocalD1(['execute', 'learning-hub', '--command', `
 INSERT OR IGNORE INTO ai_subject_controls(subject_id,openai_enabled,tts_enabled,updated_by,updated_at)
 SELECT id,1,0,'e2e-fixture','2026-01-01T00:00:00Z' FROM subjects WHERE id='sub_55555555555555555555';
 INSERT OR IGNORE INTO ai_control_initialization(id,initialized_at) VALUES(1,'2026-01-01T00:00:00Z');
`]);
process.env.E2E_AI_CONTROLS='1';
// The fixture starts with several open lessons. Give the fake runner room for one more.
runLocalD1(['execute', 'learning-hub', '--command',
  "UPDATE learner_settings SET daily_target_minutes=120 WHERE user_id='demo-ech'"]);
if (process.env.E2E_LISTENING === '1') {
  const { f, m, next } = VOICE_HASHES;
  const voices = {
    f: { fixture: 'tests/fixtures/audio/de-DE-f.aac', key: 'audio/e2e-listening-f.aac', duration: 1254 },
    m: { fixture: 'tests/fixtures/audio/de-DE-m.m4a', key: 'audio/e2e-listening-m.m4a', duration: 1672 },
  };
  for (const { fixture, key } of Object.values(voices)) {
    const upload = spawnSync(process.execPath, [
      'node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'put', 'learning-hub-uploads-local/' + key,
      '--file', fixture, '--local', '--persist-to', state, '--config', 'wrangler.jsonc',
    ], { stdio: 'inherit' });
    if (upload.error) throw upload.error;
    if (upload.status !== 0) throw Error('Could not seed listening audio.');
  }
  const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'";
  const asset = (hash, { fixture, key, duration }) =>
    `('${hash}','de-DE',1,'{}',${duration},${statSync(fixture).size},'${key}','e2e','2026-11-15T00:00:00Z')`;
  const rows = [asset(f, voices.f), asset(m, voices.m), asset(next, voices.f)];
  const audio = { ...AUDIO, hashF: f, hashM: m, durationMs: voices.f.duration };
  const assistedLessons = ASSISTED_LESSONS.map(({ id, mode, level }) => `
    INSERT INTO learning_lessons(id,user_id,subject_id,payload,assigned_date,updated,package_version,template,kind,slot)
      SELECT '${id}',user_id,subject_id,json_patch(json_set(payload,
        '$.items',json_array(json_extract(payload,'$.items[0]')),'$.stages[0].itemIds',json('["i1"]')),
        ${quote({ contract: 'lesson-package/3', knowledge: [], ...(mode === 'whole-lesson' && { gradingMode: mode }) })}),
        '2026-10-01',updated,'3',template,kind,'extra'
      FROM learning_lessons WHERE id='${LISTENING_LESSON}';
    INSERT INTO lesson_items(lesson_id,item_id,learner_id,subject_id,stage,activity,input_kind,skill_ids,difficulty,
      auto_gradable,prompt_hash,origin,payload,created_at,stimulus,audio_hash_f,audio_hash_m)
      SELECT '${id}',item_id,learner_id,subject_id,stage,activity,input_kind,skill_ids,difficulty,
        auto_gradable,prompt_hash,origin,json_set(payload,'$.audio.maxPlays',${level === 'slow' ? 2 : 1}),created_at,stimulus,audio_hash_f,audio_hash_m
      FROM lesson_items WHERE lesson_id='${LISTENING_LESSON}' AND item_id='i1';
  `);
  runLocalD1(['execute', 'learning-hub', '--command', `
    INSERT INTO audio_assets(hash,lang,rate,voices,duration_ms,bytes,r2_key,created_job_id,created_at)
      VALUES ${rows.join(',')};
    UPDATE lesson_items SET stimulus='audio',audio_hash_f='${f}',audio_hash_m='${m}',
      payload=json_set(payload,'$.audio',json(${quote(audio)}),'$.prompt','Nghe và viết lại lời chào.')
      WHERE lesson_id='${LISTENING_LESSON}' AND item_id='i1';
    UPDATE lesson_items SET stimulus='audio',audio_hash_f='${next}',audio_hash_m='${m}',
      payload=json_set(payload,'$.audio',json(${quote({ ...audio, hashF: next })}))
      WHERE lesson_id='${LISTENING_LESSON}' AND item_id='i2';
    ${assistedLessons.join('\n')}
  `]);
}
const child = spawn(process.execPath, ['scripts/dev-profiles.mjs'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
