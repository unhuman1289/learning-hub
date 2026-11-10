import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
const path=process.argv[2];if(!path)throw Error('Private production SQL required');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(path,'utf8'));
const before=db.prepare('SELECT id,user_id,track,payload,assigned_date,completed_at,response,updated FROM learning_lessons ORDER BY id').all();
const applied=new Set(db.prepare('SELECT name FROM d1_migrations').all().map(r=>r.name));const pending=[];
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())if(!applied.has(file)){db.exec(readFileSync('drizzle/'+file,'utf8'));pending.push(file);}
const after=db.prepare('SELECT id,user_id,track,payload,assigned_date,completed_at,response,updated FROM learning_lessons ORDER BY id').all();
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Production lesson cells differ; investigate without overwriting');
if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Production foreign-key drill failed');
console.log(JSON.stringify({result:'PASS',migrationPlan:pending,preservedLessons:before.length,remoteWrites:false}));db.close();
