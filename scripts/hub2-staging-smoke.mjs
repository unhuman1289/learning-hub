import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {memoryDb} from '../tests/d1-adapter.mjs';
import {insertLessonV2} from '../lib/lesson-v2/store.ts';
import {hashPassword} from 'better-auth/crypto';
// Explicitly named staging only; isolated generated learners, never an admin or real user's work.
if(!process.argv.includes('--execute-staging'))throw Error('Requires --execute-staging. Creates isolated staging fixtures, then blocks accounts and expires their sessions.');
const origin='https://learning-hub-staging.tranvu-812.workers.dev',suffix=randomBytes(10).toString('hex'),folder='private-data/h3-smoke-'+suffix;
mkdirSync(folder,{recursive:true,mode:0o700});
const owner='qa-h3-'+suffix,other=owner+'-other',password=randomBytes(32).toString('base64url'),stamp=Date.now(),db=memoryDb();
const subject='sub_'+suffix,id='les_'+suffix,fixture=JSON.parse(readFileSync('fixtures/lessons/deutsch-modalverb.json','utf8'));
const literal=x=>x===null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function remoteSql(file){const result=spawnSync(process.execPath,['--import','./scripts/wrangler-env.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','learning-hub-staging','--env','staging','--remote','--file',file],{encoding:'utf8'});writeFileSync(folder+'/wrangler-last.log',(result.stdout??'')+(result.stderr??''),{mode:0o600});if(result.status!==0)throw Error('Staging SQL failed; diagnostic retained privately.');}
let started=false;
try{
 for(const user of [owner,other]){db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'QA H3',?,1,?,?,'learner','active')").run(user,user+'@example.test',stamp,stamp);db.sqlite.prepare("INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,'credential',?,?,?,?)").run(user,user,user,await hashPassword(password),stamp,stamp);}
 db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,?,'QA H3 Deutsch','skill','active',?,'t','t')").run(subject,owner,owner);
 await insertLessonV2(db,{id,learnerId:owner,subjectId:subject,day:'2026-10-13',lesson:fixture});
 let sql='';for(const table of ['user','account','subjects','learning_lessons','lesson_items'])for(const row of db.sqlite.prepare(`SELECT * FROM ${table}`).all())sql+=`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});\n`;
 writeFileSync(folder+'/seed.sql',sql,{mode:0o600});started=true;remoteSql(folder+'/seed.sql');
 async function login(user){const r=await fetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email:user+'@example.test',password})});assert.equal(r.status,200,'sign-in');return r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
 let cookie=await login(owner),otherCookie=await login(other);
 async function call(path,method='GET',body,auth=cookie,requestOrigin=origin){const r=await fetch(origin+path,{method,headers:{cookie:auth,origin:requestOrigin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
 const lesson=(await call('/api/lessons/'+id)).body.lesson;assert.equal(JSON.stringify(lesson.items).includes('"key":'),false);
 assert.equal((await call('/api/lessons/'+id,'GET',undefined,otherCookie)).status,404);assert.equal((await call('/api/lessons/'+id+'/draft','PUT',{},cookie,'https://other.invalid')).status,403);
 assert.equal((await call('/api/admin/lessons/import','POST',{})).status,403);
 const draft=await call('/api/lessons/'+id+'/draft','PUT',{revision:lesson.draftRevision,answers:{i1:{answer:'["b"]'},i2:{answer:'Lena kann heute Suppe kochen.'},i3:{answer:'Paul möchte einen Kuchen kaufen.'}}});assert.equal(draft.status,200);
 assert.equal((await call('/api/lessons/'+id+'/items/i2/reveal','POST',{level:'hint1'})).status,200);
 const request={clientSubmissionId:crypto.randomUUID(),draftRevision:draft.body.revision,itemIds:['i1','i2','i3']};
 const submit=await call('/api/lessons/'+id+'/submissions','POST',request);assert.equal(submit.status,200);assert.equal(submit.body.submission.status,'deferred');assert.equal(submit.body.submission.attempts[0].result,'correct');assert.equal(submit.body.submission.attempts[1].support,'hint1');assert.equal(submit.body.submission.attempts[2].status,'pending');
 const replay=await call('/api/lessons/'+id+'/submissions','POST',request);assert.equal(replay.body.submission.id,submit.body.submission.id);assert.equal(replay.body.submission.replayed,true);
 const retry=await call('/api/lessons/'+id+'/submissions','POST',{...request,clientSubmissionId:crypto.randomUUID(),itemIds:['i1']});assert.equal(retry.body.submission.attempts[0].attempt_no,2);assert.equal(retry.body.submission.attempts[0].retry_of,submit.body.submission.attempts[0].id);
 assert.equal((await call('/api/submissions/'+submit.body.submission.id,'GET',undefined,otherCookie)).status,404);
 const fresh=(await call('/api/lessons/'+id)).body.lesson;
 const done=await call('/api/lessons/'+id+'/completion','PUT',{completed:true,expectedUpdated:fresh.updated});assert.equal(done.status,200);
 assert.equal((await call('/api/lessons/'+id+'/completion','PUT',{completed:false,expectedUpdated:done.body.updated})).status,200);
 assert.equal((await call('/api/auth/sign-out','POST',{})).status,200);cookie=await login(owner);
 const readback=(await call('/api/lessons/'+id)).body.lesson;assert.equal(readback.draft.i2.answer,'Lena kann heute Suppe kochen.');assert.equal(readback.lastSubmission.id,retry.body.submission.id);
 console.log(JSON.stringify({origin,result:'pass',fixtureScope:'generated learners only; signup/Resend not retested',checks:['login','D1 draft','auto grade','open pending','support recorded','UUID replay','retry history','other learner 404','origin 403','non-admin import 403','completion undo','logout/login persistence']}));
}finally{
 if(started){writeFileSync(folder+'/revoke.sql',`UPDATE user SET status='blocked' WHERE id IN (${literal(owner)},${literal(other)});\nUPDATE session SET expires_at=0 WHERE user_id IN (${literal(owner)},${literal(other)});\nUPDATE subjects SET status='archived' WHERE id=${literal(subject)} AND learner_id=${literal(owner)};`,{mode:0o600});remoteSql(folder+'/revoke.sql');console.log('QA learners blocked, sessions expired, notebook archived; no real learner rows changed or deleted.');}
 db.sqlite.close();
}
