import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { parseSubjectInput, parseSubjectPatch, parseLimits } from '../lib/subjects/policy.ts';
import { createSubject, listSubjects, updateSubject, getSubject } from '../lib/subjects/service.ts';
import { parseSettingsPatch, readSettings, updateSettings } from '../lib/learners/settings.ts';

const status = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.status;
  }
  return 200;
};
const statusAsync = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error.status;
  }
  return 200;
};

test('subject input is validated and defaulted', () => {
  const input = parseSubjectInput({ title: '  Toán 7 ', curriculum: 'Chương trình GDPT 2018 (Việt Nam), lớp 7' });
  assert.deepEqual(input, {
    title: 'Toán 7',
    template: 'skill',
    sensitivity: 'normal',
    goal: '',
    level: '',
    curriculum: 'Chương trình GDPT 2018 (Việt Nam), lớp 7',
    limits: { maxDifficulty: 3, allowNewTopics: true, maxNewSkillsPerWeek: 5 },
    weight: 3,
  });
  for (const body of [
    null,
    {},
    { title: '' },
    { title: 'x'.repeat(81) },
    { title: 'A', template: 'video' },
    { title: 'A', sensitivity: 'secret' },
    { title: 'A', weight: 6 },
    { title: 'A', goal: 'x'.repeat(2001) },
  ]) {
    assert.equal(
      status(() => parseSubjectInput(body)),
      400,
      JSON.stringify(body)?.slice(0, 60),
    );
  }
  assert.equal(
    status(() => parseLimits({ maxDifficulty: 6 })),
    400,
  );
  assert.equal(
    status(() => parseLimits({ maxDifficulty: 2, extra: 1 })),
    400,
  );
  assert.equal(
    status(() => parseLimits({ allowNewTopics: 'yes' })),
    400,
  );
});

test('patch accepts only editable fields and needs a revision', () => {
  assert.deepEqual(parseSubjectPatch({ revision: 0, goal: 'B2', aiEnabled: true }), { revision: 0, goal: 'B2', aiEnabled: true });
  for (const body of [
    { goal: 'x' },
    { revision: 0 },
    { revision: 0, legacyTrack: 'AI' },
    { revision: 0, progressSummary: 'x' },
    { revision: 0, status: 'deleted' },
    { revision: -1, goal: 'x' },
  ]) {
    assert.equal(
      status(() => parseSubjectPatch(body)),
      400,
      JSON.stringify(body),
    );
  }
});

test('create, list, update with optimistic concurrency and AI only on active notebooks', async () => {
  const db = memoryDb();
  const now = new Date('2026-10-12T10:00:00Z');
  const created = await createSubject(db, 'ech', 'ly', parseSubjectInput({ title: 'Toán 7' }), now);
  assert.match(created.id, /^sub_[0-9a-f]{20}$/);
  assert.equal(created.status, 'setup');
  assert.equal(created.aiEnabled, false);
  assert.equal(created.skillCount, 0);
  assert.equal(await statusAsync(createSubject(db, 'ech', 'ly', parseSubjectInput({ title: 'Toán 7' }), now)), 409);
  await createSubject(db, 'vu', 'vu', parseSubjectInput({ title: 'Toán 7' }), now);
  assert.deepEqual(
    (await listSubjects(db, 'ech')).map((s) => s.title),
    ['Toán 7'],
  );

  assert.equal(
    await statusAsync(updateSubject(db, 'ech', created.id, parseSubjectPatch({ revision: 0, aiEnabled: true }), now)),
    400,
    'AI needs an active notebook',
  );
  const active = await updateSubject(db, 'ech', created.id, parseSubjectPatch({ revision: 0, status: 'active', goal: 'Nắm chắc tỉ lệ thức' }), now);
  assert.equal(active.revision, 1);
  assert.equal(active.goal, 'Nắm chắc tỉ lệ thức');
  assert.equal(await statusAsync(updateSubject(db, 'ech', created.id, parseSubjectPatch({ revision: 0, weight: 5 }), now)), 409, 'stale revision');
  const ai = await updateSubject(db, 'ech', created.id, parseSubjectPatch({ revision: 1, aiEnabled: true, limits: { maxDifficulty: 2 } }), now);
  assert.equal(ai.aiEnabled, true);
  assert.deepEqual(ai.limits, { maxDifficulty: 2, allowNewTopics: true, maxNewSkillsPerWeek: 5 });
  assert.equal(
    await statusAsync(updateSubject(db, 'ech', created.id, parseSubjectPatch({ revision: 2, status: 'paused' }), now)),
    400,
    'pausing with AI on must turn AI off too',
  );
  assert.equal(
    (await updateSubject(db, 'ech', created.id, parseSubjectPatch({ revision: 2, status: 'paused', aiEnabled: false }), now)).status,
    'paused',
  );

  assert.equal(await statusAsync(getSubject(db, 'vu', created.id)), 404, 'another learner cannot reach the notebook by id');
  assert.equal(await statusAsync(updateSubject(db, 'vu', created.id, parseSubjectPatch({ revision: 3, goal: 'x' }), now)), 404);
  db.sqlite.prepare("UPDATE subjects SET status='archived' WHERE id=?").run(created.id);
  assert.equal((await listSubjects(db, 'ech')).length, 0, 'archived notebooks leave the shelf');
  db.sqlite.close();
});

test('learner settings: defaults, validated patch, role untouched', async () => {
  const db = memoryDb();
  assert.deepEqual(await readSettings(db, 'ech'), {
    dailyTargetMinutes: 60,
    role: 'adult',
    displayName: null,
    explainLanguage: 'vi',
    preferences: {},
    aiBudget: null,
    personalPrompt: '',
    avatar: '',
  });
  db.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role) VALUES('ech',60,'t','child')").run();
  const saved = await updateSettings(db, 'ech', parseSettingsPatch({ dailyTargetMinutes: 45, displayName: 'Ếch', aiBudget: { assessPerDay: 10 } }));
  assert.deepEqual(saved, {
    dailyTargetMinutes: 45,
    role: 'child',
    displayName: 'Ếch',
    explainLanguage: 'vi',
    preferences: {},
    aiBudget: { assessPerDay: 10 },
    personalPrompt: '',
    avatar: '',
  });
  for (const body of [
    {},
    { role: 'adult' },
    { dailyTargetMinutes: 4 },
    { displayName: '' },
    { explainLanguage: 'fr' },
    { aiBudget: { tokens: 5 } },
    { aiBudget: { assessPerDay: 1000 } },
    { preferences: { x: 'y'.repeat(3000) } },
  ]) {
    assert.equal(
      status(() => parseSettingsPatch(body)),
      400,
      JSON.stringify(body).slice(0, 60),
    );
  }
  db.sqlite.close();
});

test('personal and notebook prompts are editable, bounded, and reach the AI contexts (L5.5)', async () => {
  const { parseSettingsPatch } = await import('../lib/learners/settings.ts');
  const { parseSubjectPatch } = await import('../lib/subjects/policy.ts');
  assert.deepEqual(parseSettingsPatch({ personalPrompt: '  Giải thích ngắn, ví dụ ở phòng lab.  ', avatar: '🦊' }), {
    personalPrompt: 'Giải thích ngắn, ví dụ ở phòng lab.',
    avatar: '🦊',
  });
  assert.throws(() => parseSettingsPatch({ personalPrompt: 'x'.repeat(4001) }), /4000/);
  assert.throws(() => parseSettingsPatch({ avatar: '<img>' }), /Biểu tượng/);
  assert.equal(parseSubjectPatch({ revision: 0, instructions: 'Lübeck, 70% đời sống' }).instructions, 'Lübeck, 70% đời sống');
  assert.throws(() => parseSubjectPatch({ revision: 0, instructions: 'x'.repeat(4001) }), /Prompt của sổ/);
  const src = (await import('node:fs')).readFileSync(new URL('../lib/ai-jobs/context/common.ts', import.meta.url), 'utf8');
  assert.match(src, /personalPrompt: safeText\(settings\?\.personal_prompt/);
});
