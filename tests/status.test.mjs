import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { learnerStatus } from '../lib/status.ts';

test('status lists due skills, open errors and G/P/N mastery per active notebook, without answers', async () => {
  const db = memoryDb();
  const t = '2026-11-01T00:00:00.000Z';
  db.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES('prf_s','S','s@local.invalid',0,1,1,'learner','active')",
    )
    .run();
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('sub_ssssssssssssssssssss','prf_s','Deutsch','skill','active','prf_s','t','t')",
    )
    .run();
  const skill = db.sqlite.prepare(
    "INSERT INTO skills(id,subject_id,learner_id,key,name,status,origin,created_at,updated_at) VALUES(?,'sub_ssssssssssssssssssss','prf_s',?,?,'active','migration',?,?)",
  );
  skill.run('sk_a', 'g-v2', 'Verb an Position 2', t, t);
  skill.run('sk_b', 'p-komma', 'Komma vor weil', t, t);
  const state = db.sqlite.prepare(
    "INSERT INTO skill_states(skill_id,learner_id,subject_id,mastery,mastery_ceiling,dim_knowledge,dim_recognition,dim_application,dim_retention,attempts_total,next_review_day,evidence_hash,recompute_token,updated_at) VALUES(?,'prf_s','sub_ssssssssssssssssssss',?,?,0,0,0,0,1,?,'h','x',?)",
  );
  state.run('sk_a', 'demonstrated', 'demonstrated', '2026-12-01', t);
  state.run('sk_b', 'developing', 'developing', '2026-11-09', t);
  db.sqlite
    .prepare(
      "INSERT INTO error_patterns(id,learner_id,subject_id,skill_id,label,label_norm,category,confidence,status,occurrences,days_seen,first_seen_at,last_seen_at) VALUES('err_1','prf_s','sub_ssssssssssssssssssss','sk_b','P: thiếu dấu phẩy trước weil','p thieu','application','confirmed','open',3,2,?,?)",
    )
    .run(t, t);
  const status = await learnerStatus(db, 'prf_s', new Date('2026-11-10T09:00:00Z'));
  assert.deepEqual(status.notebooks[0].due, ['Komma vor weil']);
  assert.deepEqual(status.notebooks[0].facets, { G: { demonstrated: 1, total: 1 }, P: { demonstrated: 0, total: 1 } });
  assert.deepEqual(status.notebooks[0].openErrors, [{ label: 'P: thiếu dấu phẩy trước weil', status: 'open', occurrences: 3 }]);
  assert.equal(JSON.stringify(status).includes('answer'), false);
  db.sqlite.close();
});
