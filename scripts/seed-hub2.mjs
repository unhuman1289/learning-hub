import { memoryDb } from '../tests/d1-adapter.mjs';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import { runLocalD1 } from './local-db.mjs';
import { hashPassword } from 'better-auth/crypto';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
// Local-only demo identity. This script has no remote switch, API token or cloud credentials.
const db = memoryDb(),
  password = 'Demo-local-study-2026!',
  stamp = Date.now();
const users = [
  ['demo-admin', 'Quản trị thử', 'admin', 'adult'],
  ['demo-adult', 'Người học thử', 'learner', 'adult'],
  ['demo-ech', 'Ếch thử', 'learner', 'child'],
];
for (const [id, name, role, learnerRole] of users) {
  db.sqlite
    .prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,?,?,?,'active')")
    .run(id, name, id + '@example.test', stamp, stamp, role);
  db.sqlite
    .prepare("INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,'credential',?,?,?,?)")
    .run(id + '-credential', id, id, await hashPassword(password), stamp, stamp);
  db.sqlite
    .prepare('INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name) VALUES(?,45,?,?,?)')
    .run(id, new Date(stamp).toISOString(), learnerRole, name);
}
db.sqlite.prepare('INSERT INTO guardians VALUES(?,?,?,?)').run('demo-admin', 'demo-ech', 'demo-admin', new Date(stamp).toISOString());
// Fixtures refer to skills by key. Resolve them just as the planner does so feedback can update skill states.
function fixtureLesson(lesson, subjectId, learnerId) {
  const ids = new Map();
  const addSkill = db.sqlite.prepare(`INSERT OR IGNORE INTO skills(id,subject_id,learner_id,key,name,status,origin,created_at,updated_at)
    VALUES(?,?,?,?,?,'active','migration',?,?)`);
  const refs = [...lesson.targetSkills, ...lesson.items.flatMap(item => [
    ...item.skills, ...(item.rubric ?? []).flatMap(criterion => criterion.skill ? [criterion.skill] : []),
  ])];
  const now = new Date(stamp).toISOString();
  for (const ref of new Set(refs)) {
    const key = ref.replace(/^key:/, '');
    const id = 'sk_' + createHash('sha256').update(subjectId + ':' + ref).digest('hex').slice(0, 20);
    addSkill.run(id, subjectId, learnerId, key, key.replaceAll('-', ' '), now, now);
    ids.set(ref, id);
  }
  const resolve = ref => ids.get(ref) ?? ref;
  return {
    ...lesson,
    contract: 'lesson-package/3',
    knowledge: [],
    reasonRefs: lesson.reasonRefs.map(resolve),
    targetSkills: lesson.targetSkills.map(resolve),
    items: lesson.items.map(item => ({
      ...item,
      skills: item.skills.map(resolve),
      rubric: item.rubric?.map(criterion => criterion.skill ? { ...criterion, skill: resolve(criterion.skill) } : criterion),
    })),
  };
}

const subjectId = 'sub_dddddddddddddddddddd';
db.sqlite
  .prepare(
    "INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,'demo-ech','Deutsch','skill','active','demo-admin','t','t')",
  )
  .run(subjectId);
for (const [index, file] of ['deutsch-modalverb.json', 'deutsch-w-fragen.json', 'deutsch-nicht-kein.json', 'deutsch-review.json'].entries()) {
  const checked = validateLessonPackage(JSON.parse(readFileSync('fixtures/lessons/' + file, 'utf8')));
  if (!checked.lesson) throw Error(JSON.stringify(checked.issues));
  await insertLessonV2(db, {
    learnerId: 'demo-ech',
    subjectId,
    day: `2026-10-${String(9 + index).padStart(2, '0')}`,
    lesson: fixtureLesson(checked.lesson, subjectId, 'demo-ech'),
    id: 'les_' + String(index + 1).padStart(20, '0'),
  });
}
for (const [index, title, file] of [
  [5, 'Toán 7', 'math7-ti-le.json'],
  [6, 'KHTN 7 · Hóa', 'chem7-nguyen-tu.json'],
]) {
  const subjectId = 'sub_' + String(index).repeat(20);
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,'demo-ech',?,'skill','active','demo-admin','t','t')",
    )
    .run(subjectId, title);
  const checked = validateLessonPackage(JSON.parse(readFileSync('fixtures/lessons/' + file, 'utf8')));
  if (!checked.lesson) throw Error(JSON.stringify(checked.issues));
  await insertLessonV2(db, {
    learnerId: 'demo-ech',
    subjectId,
    day: '2026-10-13',
    lesson: fixtureLesson(checked.lesson, subjectId, 'demo-ech'),
    id: 'les_' + String(index).padStart(20, '0'),
  });
}
const readingSubject = 'sub_77777777777777777777';
db.sqlite
  .prepare(
    "INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,'demo-adult','Đọc về hệ thống','reading','active','demo-admin','t','t')",
  )
  .run(readingSubject);
const reading = validateLessonPackage(JSON.parse(readFileSync('fixtures/lessons/reading-d1.json', 'utf8')));
if (!reading.lesson) throw Error(JSON.stringify(reading.issues));
await insertLessonV2(db, {
  learnerId: 'demo-adult',
  subjectId: readingSubject,
  day: '2026-10-13',
  lesson: fixtureLesson(reading.lesson, readingSubject, 'demo-adult'),
  id: 'les_00000000000000000007',
});
const literal = (x) => (x === null ? 'NULL' : typeof x === 'number' ? String(x) : "'" + String(x).replaceAll("'", "''") + "'");
const tables = ['user', 'account', 'learner_settings', 'guardians', 'subjects', 'skills', 'learning_lessons', 'lesson_items'];
let sql = '';
for (const table of tables)
  for (const row of db.sqlite.prepare(`SELECT * FROM "${table}"`).all())
    sql += `INSERT OR IGNORE INTO "${table}" (${Object.keys(row)
      .map((k) => '"' + k + '"')
      .join(',')}) VALUES (${Object.values(row).map(literal).join(',')});\n`;
// Only fill the empty roadmap on our sample notebook.
sql += `UPDATE subjects SET roadmap=(
  SELECT json_array(json_object('title','Động từ tình thái khi hẹn lịch',
    'objective','Đặt lịch bằng tiếng Đức','situation','Hẹn đồng nghiệp',
    'mode','new','skills',json_array(id)))
  FROM skills WHERE subject_id=subjects.id AND key='modalverb-infinitiv'
) WHERE id='sub_dddddddddddddddddddd' AND learner_id='demo-ech'
  AND coalesce(json_array_length(roadmap),0)=0;
`;
mkdirSync('.wrangler', { recursive: true });
const file = '.wrangler/hub2-demo.sql';
writeFileSync(file, sql, { mode: 0o600 });
if (process.argv.includes('--print-counts')) console.log({ users: users.length, lessons: 7 });
else {
  runLocalD1(['migrations', 'apply', 'learning-hub']);
  runLocalD1(['execute', 'learning-hub', '--file', file]);
  console.log('Local demo: demo-admin@example.test / demo-ech@example.test. Password: ' + password);
}
db.sqlite.close();
