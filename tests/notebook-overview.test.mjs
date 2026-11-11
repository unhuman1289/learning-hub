import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { readNotebookOverview } from '../lib/learner-model/overview.ts';

test('overview counts current, graded first answers without help in the selected notebook and Berlin window', async () => {
  const db = memoryDb();
  try {
    // This aggregate needs answer evidence, not lesson contents or submission envelopes.
    db.sqlite.exec(`PRAGMA foreign_keys=OFF;
      INSERT INTO study_time(user_id,day,track,seconds,updated) VALUES
        ('learner','2026-11-11','notebook',60,'t'),('learner','2026-11-11','Deutsch',120,'t'),
        ('learner','2026-11-11','other',900,'t'),('other','2026-11-11','notebook',900,'t'),
        ('learner','2026-10-28','notebook',900,'t');`);
    const attempt = db.sqlite.prepare(`INSERT INTO attempts
      (id,submission_id,learner_id,lesson_id,item_id,subject_id,skill_ids,activity,attempt_no,answer,support,context,status,current_grade_id,day,created_at)
      VALUES(?,'submission',?,'lesson',?,?,'[]','create',?,'',?,'lesson',?,?,?,'t')`);
    const grade = db.sqlite.prepare("INSERT INTO grades(id,attempt_id,grader,result,score,feedback,created_at) VALUES(?,?,'auto',?,0,'','t')");
    const rows = [
      ['correct', 'learner', 'notebook', 1, 'none', 'graded', 'correct'],
      ['partial', 'learner', 'notebook', 1, 'none', 'graded', 'partial'],
      ['hinted', 'learner', 'notebook', 1, 'hint1', 'graded', 'correct'],
      ['retry', 'learner', 'notebook', 2, 'none', 'graded', 'correct'],
      ['pending', 'learner', 'notebook', 1, 'none', 'pending', null],
      ['disputed', 'learner', 'notebook', 1, 'none', 'disputed', 'correct'],
      ['ungradable', 'learner', 'notebook', 1, 'none', 'graded', 'ungradable'],
      ['other-subject', 'learner', 'other', 1, 'none', 'graded', 'correct'],
      ['other-learner', 'other', 'notebook', 1, 'none', 'graded', 'correct'],
    ];
    for (const [id, user, subject, no, support, status, result] of rows) {
      attempt.run(id, user, id, subject, no, support, status, result ? 'g-' + id : null, '2026-11-11');
      if (result) grade.run('g-' + id, id, result);
    }
    grade.run('old-grade', 'partial', 'correct');
    const overview = await readNotebookOverview(db, 'learner', 'notebook', 'Deutsch', new Date('2026-11-10T23:20:00Z'));
    assert.equal(overview.days.length, 14);
    assert.equal(overview.days[0].day, '2026-10-29');
    assert.deepEqual(overview.days.at(-1), { day: '2026-11-11', seconds: 180, correct: 1, graded: 2 });
  } finally {
    db.sqlite.close();
  }
});

test('overview ranks unresolved errors and omits suspected ones when the learner cannot see them', async () => {
  const db = memoryDb();
  try {
    db.sqlite.exec(`PRAGMA foreign_keys=OFF;
      INSERT INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at) VALUES
        ('active','notebook','learner','verbs','Động từ','',0,'[]','active','ai','t','t'),
        ('retired','notebook','learner','old','Cũ','',0,'[]','retired','ai','t','t'),
        ('elsewhere','other','learner','other','Khác','',0,'[]','active','ai','t','t');`);
    const insert = db.sqlite.prepare(`INSERT INTO error_patterns
      (id,learner_id,subject_id,skill_id,label,label_norm,category,confidence,status,occurrences,days_seen,first_seen_at,last_seen_at)
      VALUES(?,'learner',?,?,?,?,'application',?,?,?,?,'t','t')`);
    for (const [id, subject, skill, confidence, status, occurrences, days] of [
      ['confirmed', 'notebook', 'active', 'confirmed', 'open', 2, 2],
      ['watch', 'notebook', 'active', 'suspected', 'improving', 3, 1],
      ['once', 'notebook', 'active', 'suspected', 'open', 1, 1],
      ['resolved', 'notebook', 'active', 'confirmed', 'resolved', 5, 3],
      ['old', 'notebook', 'retired', 'confirmed', 'open', 9, 4],
      ['other', 'other', 'elsewhere', 'confirmed', 'open', 9, 4],
    ]) insert.run(id, subject, skill, id, id, confidence, status, occurrences, days);
    const now = new Date('2026-11-11T10:00:00Z');
    const adult = await readNotebookOverview(db, 'learner', 'notebook', null, now);
    assert.deepEqual(adult.errors.map(error => error.id), ['confirmed', 'watch', 'once']);
    assert.equal(adult.errors[1].daysSeen, 1);
    const child = await readNotebookOverview(db, 'learner', 'notebook', null, now, false);
    assert.deepEqual(child.errors.map(error => error.id), ['confirmed']);
  } finally {
    db.sqlite.close();
  }
});
