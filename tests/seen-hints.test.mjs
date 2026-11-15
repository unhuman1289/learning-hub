import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { learningPreferences, markHintSeen, readSettings, showsHint, updateSettings } from '../lib/learners/settings.ts';

test('a seen hint is stored in preferences without touching other settings', async () => {
  const db = memoryDb();
  db.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,preferences) VALUES('ech',30,'t','child',?)")
    .run(JSON.stringify({ topics: ['Tiere'] }));
  assert.equal(showsHint(await readSettings(db, 'ech'), 'pageEdge'), true);
  await markHintSeen(db, 'ech', 'pageEdge');
  await markHintSeen(db, 'ech', 'pageEdge');
  const settings = await readSettings(db, 'ech');
  assert.equal(showsHint(settings, 'pageEdge'), false);
  assert.deepEqual(settings.preferences, { topics: ['Tiere'], pageEdgeHintSeen: true });
  assert.equal(settings.role, 'child');
  assert.equal(settings.dailyTargetMinutes, 30);
  await updateSettings(db, 'ech', { preferences: { topics: ['Musik'] } });
  assert.deepEqual((await readSettings(db, 'ech')).preferences, { topics: ['Musik'], pageEdgeHintSeen: true }, 'editing preferences keeps seen hints');
  db.sqlite.close();
});

test('a learner without settings gets the default row and the flag', async () => {
  const db = memoryDb();
  await markHintSeen(db, 'vu', 'pageEdge');
  const settings = await readSettings(db, 'vu');
  assert.equal(showsHint(settings, 'pageEdge'), false);
  assert.equal(settings.dailyTargetMinutes, 45);
  assert.equal(settings.role, 'adult');
  db.sqlite.close();
});

test('model context never sees UI bookkeeping', () => {
  assert.deepEqual(learningPreferences({ pageEdgeHintSeen: true, pace: 'chậm' }), { pace: 'chậm' });
});
