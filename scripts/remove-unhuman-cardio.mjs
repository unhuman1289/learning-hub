// Explicitly requested account-specific removal. Requires a fresh private D1 export.
import {DatabaseSync} from 'node:sqlite';import {readFileSync,writeFileSync} from 'node:fs';
import {runRemoteD1,parseWranglerRows} from './d1-remote.mjs';
const [environment,file,execute]=process.argv.slice(2);
if(!['staging','production'].includes(environment)||!file||execute&&execute!=='--execute')throw Error('Usage: staging|production private-before.sql [--execute]');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(file,'utf8'));
const owners=db.prepare("SELECT id FROM user WHERE lower(name)='unhuman'").all();if(owners.length!==1)throw Error('Exactly one unhuman owner required.');
const owner=owners[0].id,quote=x=>"'"+String(x).replaceAll("'","''")+"'",uid=quote(owner);
const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
const columns=t=>new Set(db.prepare('PRAGMA table_info('+t+')').all().map(r=>r.name));
const subjectIds=db.prepare("SELECT id FROM subjects WHERE learner_id=? AND (legacy_track='Cardio' OR title='Cardio')").all(owner).map(r=>r.id);
if(!subjectIds.length){console.log('No Cardio notebook remains.');process.exit(0);}
const subjects=subjectIds.map(quote).join(','),condition=`user_id=${uid} AND (coalesce(track,'')='Cardio'${columns('learning_lessons').has('subject_id')?' OR subject_id IN ('+subjects+')':''})`;
const lessonIds=db.prepare('SELECT id FROM learning_lessons WHERE '+condition).all().map(r=>r.id);
const lessons=lessonIds.length?lessonIds.map(quote).join(','):"''";
// Refuse ambiguous evidence removal rather than broadening this account cleanup.
for(const table of ['attempts','submissions'])if(tables.has(table)&&db.prepare(`SELECT count(*) AS n FROM ${table} WHERE learner_id=${uid} AND lesson_id IN (${lessons})`).get().n)throw Error('Cardio has submitted evidence; use a reviewed evidence removal drill.');
let sql='';
for(const t of ['run_items','legacy_run_items'])if(tables.has(t)&&columns(t).has('lesson_id'))sql+=`DELETE FROM ${t} WHERE lesson_id IN (${lessons});\n`;
if(tables.has('run_targets'))sql+=`DELETE FROM run_targets WHERE user_id=${uid} AND track='Cardio';\n`;
if(tables.has('learning_slots'))sql+=`DELETE FROM learning_slots WHERE user_id=${uid} AND track='Cardio';\n`;
if(tables.has('study_time'))sql+=`DELETE FROM study_time WHERE user_id=${uid} AND track='Cardio';\n`;
if(tables.has('ai_jobs'))sql+=`DELETE FROM ai_jobs WHERE learner_id=${uid} AND subject_id IN (${subjects});\n`;
if(tables.has('lesson_items'))sql+=`DELETE FROM lesson_items WHERE learner_id=${uid} AND lesson_id IN (${lessons});\n`;
sql+=`DELETE FROM learning_lessons WHERE ${condition};\nDELETE FROM subjects WHERE learner_id=${uid} AND id IN (${subjects});\n`;
const protectedRows=db.prepare('SELECT * FROM learning_lessons WHERE NOT ('+condition+') ORDER BY id').all();
db.exec('PRAGMA foreign_keys=ON');db.exec('BEGIN');db.exec(sql);if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key drill failed.');
if(JSON.stringify(protectedRows)!==JSON.stringify(db.prepare('SELECT * FROM learning_lessons ORDER BY id').all()))throw Error('Unrelated lessons changed.');db.exec('ROLLBACK');
const path='private-data/h7-h8/remove-cardio-'+environment+'.sql';writeFileSync(path,sql,{mode:0o600});
console.log(JSON.stringify({environment,notebooks:subjectIds.length,lessons:lessonIds.length,drill:'PASS',executed:execute==='--execute'}));
if(execute==='--execute'){
 const name=environment==='staging'?'learning-hub-staging':'learning-hub-prod';
 // Compare current IDs to the reviewed backup; new Cardio lessons require a new drill.
 const current=parseWranglerRows(runRemoteD1(environment,name,['--command','SELECT id FROM learning_lessons WHERE '+condition+' ORDER BY id']));
 if(JSON.stringify(current.map(r=>r.id).sort())!==JSON.stringify([...lessonIds].sort()))throw Error('Cardio lesson list changed; fresh backup required.');
 runRemoteD1(environment,name,['--file',path]);
 const remain=parseWranglerRows(runRemoteD1(environment,name,['--command',`SELECT id FROM subjects WHERE learner_id=${uid} AND (legacy_track='Cardio' OR title='Cardio')`]));if(remain.length)throw Error('Cardio removal readback failed.');
 console.log('Cardio removed and read back; unrelated lessons preserved in SQLite drill.');
}
db.close();
