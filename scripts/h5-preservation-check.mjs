import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runRemoteD1, parseWranglerRows } from './d1-remote.mjs';
const file = process.argv[2];
if (!file) throw Error('Requires private pre-migration staging SQL.');
const db = new DatabaseSync(':memory:');
try {
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec(readFileSync(file, 'utf8'));
  const tables = {
    learning_lessons: "user_id NOT LIKE 'qa-h5-%'",
    subjects: "learner_id NOT LIKE 'qa-h5-%'",
    skills: "learner_id NOT LIKE 'qa-h5-%'",
    lesson_items: "learner_id NOT LIKE 'qa-h5-%'",
    submissions: "learner_id NOT LIKE 'qa-h5-%'",
    attempts: "learner_id NOT LIKE 'qa-h5-%'",
    grades: "attempt_id IN (SELECT id FROM attempts WHERE learner_id NOT LIKE 'qa-h5-%')",
  };
  const digest = (rows) =>
    createHash('sha256')
      .update(
        JSON.stringify(
          rows
            .map((r) =>
              JSON.stringify(
                Object.fromEntries(
                  Object.keys(r)
                    .sort()
                    .map((k) => [k, r[k]]),
                ),
              ),
            )
            .sort(),
        ),
      )
      .digest('hex');
  const verified = [];
  for (const [table, where] of Object.entries(tables)) {
    const sql = `SELECT * FROM ${table} WHERE ${where}`,
      old = db.prepare(sql).all(),
      current = parseWranglerRows(runRemoteD1('staging', 'learning-hub-staging', ['--command', sql]));
    if (digest(old) !== digest(current)) throw Error('Real learner data differs in ' + table + '; investigate without overwriting.');
    verified.push({ table, rows: old.length });
  }
  console.log(JSON.stringify({ result: 'PASS', realLearnerCellsUnchanged: verified }));
} finally {
  db.close();
}
