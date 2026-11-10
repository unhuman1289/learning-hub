import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { parseCsv, buildImport, MARKER } from '../scripts/import-legacy-sheet.mjs';

// Authored rows in the Project v6.1 layout; no learner data.
const tags = parseCsv(
  'tag_id,label,description,status,kind,attempts_7d,mastered\nT-V2,Verb an Position 2,"Hauptsatz, Verb zweite Stelle",active,G,4,1\nT-KOMMA,Komma vor weil,,active,P,2,0\nT-OLD,Alt,,archived,G,0,0\nT-HOEF,Höfliche Bitten,,active,N,1,\n',
);
const items = parseCsv(
  'item_id,target,tag,interval,last_date,next_due,misses,status,last_session,source,original_sentence,example\n' +
    'I-1,"weil … Verb am Ende",T-V2,1,2026-11-01,2026-11-11,3,active,S-1,x,"weil ich bin müde",\n' +
    'I-2,Komma vor weil,T-KOMMA,7,2026-10-20,2026-12-30,1,active,S-1,x,,\n' +
    'I-3,Könnten Sie…,T-HOEF,30,2026-10-01,2026-10-31,0,graduated,S-1,x,,\n',
);
const attempts = parseCsv(
  'date,session,item_id,tag,first_ok,hints,kind,answer,correction,attempt_id,evidence,result,response_id,source,prompt\n' +
    '2026-11-05,S-2,I-1,T-V2,1,0,G,…,,a1,free,1,R001,,\n' +
    '2026-11-05,S-2,I-1,T-V2,0,0,G,…,,a2,free,0,R002,,\n' +
    '2026-11-05,S-2,I-2,T-KOMMA,1,1,P,…,,a3,free,1,R003,,\n' +
    '2026-11-05,S-2,I-2,T-KOMMA,,0,P,…,,a4,repair,1,R004,,\n',
);
const subject = 'sub_cccccccccccccccccccc',
  learner = 'prf_import';

test('CSV parsing handles quotes, commas and empty cells', () => {
  assert.equal(tags.length, 4);
  assert.equal(tags[0].description, 'Hauptsatz, Verb zweite Stelle');
  assert.equal(items[0].target, 'weil … Verb am Ende');
  assert.equal(tags[3].mastered, '');
});

test('legacy Sheet import: skills by facet, summary in the notebook prompt, idempotent SQL', () => {
  const r = buildImport({ tags, items, attempts, learnerId: learner, subjectId: subject, today: '2026-11-10', now: '2026-11-10T10:00:00.000Z' });
  assert.deepEqual(
    r.skills.map((s) => [s.key, s.facet, s.mastered]),
    [
      ['g-t-v2', 'G', true],
      ['p-t-komma', 'P', false],
      ['n-t-hoef', 'N', false],
    ],
  );
  assert.equal(r.report.mastered, 1);
  assert.match(r.summary, /^\[Từ Google Sheets đến 2026-11-10/);
  assert.match(r.summary, /G 1\/2, P 0\/1, N –/);
  assert.match(r.summary, /Đã thành thạo theo Sheet: Verb an Position 2/);
  assert.match(r.summary, /weil … Verb am Ende \[G\] \(3\)/);
  assert.match(r.summary, /đến hạn ôn trong 14 ngày: weil … Verb am Ende \(2026-11-11\)\./);
  assert.doesNotMatch(r.summary, /Könnten/);

  const db = memoryDb();
  db.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'I','i@local.invalid',0,1,1,'learner','active')",
    )
    .run(learner);
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at,instructions) VALUES(?,?,'Deutsch','skill','active',?,'t','t','Lübeck, 70% đời sống')",
    )
    .run(subject, learner, learner);
  db.sqlite.exec(r.sql);
  db.sqlite.exec(r.sql);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM skills WHERE subject_id=?').get(subject).n, 3);
  const instructions = db.sqlite.prepare('SELECT instructions FROM subjects WHERE id=?').get(subject).instructions;
  assert.equal(instructions.split(MARKER).length, 2);
  assert(instructions.startsWith('Lübeck, 70% đời sống\n\n[Từ Google Sheets'));
  assert(instructions.length <= 4000);
  db.sqlite.close();
});

test('import refuses missing ids', () => {
  assert.throws(() => buildImport({ tags, items, attempts, learnerId: '', subjectId: subject, today: '2026-11-10' }), /required/);
});
