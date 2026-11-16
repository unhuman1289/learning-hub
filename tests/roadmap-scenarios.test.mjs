import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {backupColumns,buildRestoreSql} from '../lib/backup-contract.mjs';
import {memoryDb} from './d1-adapter.mjs';
import {createSubject,updateSubject} from '../lib/subjects/service.ts';
import {parseSubjectInput,parseSubjectPatch} from '../lib/subjects/policy.ts';
import {frameworkFor} from '../lib/roadmap/frameworks.ts';
import {decideNext,passesChallenge,placeSteps,stepStatus,roadmapProgressWrite} from '../lib/roadmap/progress.ts';
import {listSteps,applyRoadmapChanges} from '../lib/roadmap/store.ts';
import {checkCoverage} from '../lib/roadmap/coverage.ts';
import {readRoadmapProgress} from '../lib/roadmap/report.ts';
import {stage,upsertSource,addProbe,activate,contextExcerpt,listGaps} from '../lib/knowledge/service.ts';

const stamp='2026-11-12T09:00:00Z';
const newSubject=(db,learner,title,goal='Học theo thứ tự')=>
  createSubject(db,learner,learner,parseSubjectInput({title,goal}),new Date(stamp));
function seedStep(db, learner, subject, id, title, skill, ord=1, status='planned', band=2, requires=[]) {
  db.sqlite.prepare(`INSERT INTO roadmap_steps(id,learner_id,subject_id,ord,title,objective,situation,skill_ids,requires,band,kind,status,origin,created_at,updated_at)
    VALUES(?,?,?,?,?,'Vận dụng','','["'||?||'"]',?,?,'new',?,'migration',?,?)`).run(id,learner,subject,ord,title,skill,JSON.stringify(requires),band,status,stamp,stamp);
}
const row=(skill,correct=true,options={})=>({skills:[skill],correct,attemptNo:1,support:'none',stage:'independent',activity:'apply',...options});
const skill=skillId=>({skillId,mastery:'developing',status:'active',nextReviewDay:null});
const state=steps=>({steps,skills:steps.flatMap(step=>step.skills.map(skill)),errors:[],independentSkills:new Set(),challenged:new Set(),
  day:'2026-11-12',daily:true,requestMode:'learn',maxDifficulty:5,recentPractice:0});

test('Deutsch places two steps, targets a confirmed error, passes a challenge and extends',async t=>{
  const db=memoryDb();t.after(()=>db.sqlite.close());
  const {id}=await newSubject(db,'adult','Deutsch','Tôi đang học A2');
  seedStep(db,'adult',id,'word','Wortstellung','word-order');
  seedStep(db,'adult',id,'dat','Dativ','dative',2,'planned',2,['word']);
  seedStep(db,'adult',id,'mail','Termin bestätigen','appointment',3,'planned',3,['dat']);
  const steps=await listSteps(db,'adult',id);
  assert.deepEqual(placeSteps(steps,[row('word-order'),row('dative'),row('appointment',false)]),['word','dat']);
  assert.deepEqual(placeSteps(steps,[row('word-order'),row('dative',true,{support:'hint'}),row('appointment')]),['word']);
  steps[0].status='placed';steps[1].status='practising';
  const base={...state(steps),independentSkills:new Set(['dative'])};
  const confirmed={skillId:'dative',confidence:'confirmed',status:'open'};
  assert.equal(decideNext({...base,errors:[confirmed]}).reasonCode,'confirmed_error');
  assert.equal(decideNext(base).mode,'challenge');
  assert.equal(decideNext({...base,challenged:new Set(['dat'])}).mode,'practice');
  assert.equal(passesChallenge(steps[1],[row('dative'),row('dative'),row('dative'),row('dative'),row('dative',false)]),true);
  assert.equal(passesChallenge(steps[1],Array.from({length:5},()=>row('dative',true,{attemptNo:2}))),false);
  assert.equal(stepStatus(steps[1],new Set(['dative']),[row('dative')],true),'passed');
  steps[1].status='passed';
  assert.equal(decideNext({...base,steps}).step.id,'mail');
  steps[2].status='passed';
  assert.equal(decideNext({...base,steps}).roadmapTask,'extend');
});

test('two Rust learners share verified sources and a gap, while their steps stay separate',async t=>{
  const db=memoryDb();t.after(()=>db.sqlite.close());
  const first=await newSubject(db,'a','Rust');
  const second=await newSubject(db,'b','Rust');
  const other=await newSubject(db,'b','Python');
  db.sqlite.prepare("UPDATE subjects SET topic_key='rust' WHERE id IN (?,?)").run(first.id,second.id);
  seedStep(db,'a',first.id,'a-own','Ownership','a-own',1,'passed');
  seedStep(db,'a',first.id,'a-borrow','Borrowing','a-borrow',2);
  seedStep(db,'b',second.id,'b-borrow','Borrowing','b-borrow',1,'practising');
  const principal={clientId:'test'};
  const v=await stage(db,principal,'Rust source');
  const source=await upsertSource(db,principal,{versionId:v.id,clientChangeId:'rust-source',
    source:{url:'https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html',title:'Ownership',publisher:'Rust project',
      sourceType:'official_doc',retrievedAt:stamp,readScope:'full',language:'en'},
    notes:[{heading:'Ownership',body:'A value has one owner.'}],links:[{topicKey:'rust'}]});
  await addProbe(db,principal,{versionId:v.id,topicKey:'rust',query:'Ownership',expectSourceId:source.sourceId,clientChangeId:'probe'});
  assert.equal((await activate(db,principal,v.id)).status,'active');
  for (const subject of [first,second])
    assert.equal((await contextExcerpt(db,{subjectId:subject.id,query:'Ownership'})).notes[0].sourceId,source.sourceId);
  assert.equal(await contextExcerpt(db,{subjectId:other.id,query:'Ownership'}),undefined);
  assert.deepEqual(await checkCoverage(db,'a',first.id),['a-borrow']);
  assert.deepEqual(await checkCoverage(db,'b',second.id),['b-borrow']);
  const gaps=await listGaps(db);
  assert.equal(gaps.length,1);
  assert.equal(gaps[0].seen_count,2);
  assert.equal(gaps[0].priority,'high');
  assert.equal((await readRoadmapProgress(db,'a',first.id)).done.length,1);
  assert.equal((await readRoadmapProgress(db,'b',second.id)).done.length,0);
  assert.equal(await readRoadmapProgress(db,'a',second.id),null);
  const snapshot=Object.fromEntries(Object.entries(backupColumns).map(([table,columns])=>[
    table,db.sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(table) ? db.sqlite.prepare('SELECT '+columns.join(',')+' FROM '+table).all() : [],
  ]));
  const restored=memoryDb();t.after(()=>restored.sqlite.close());
  restored.sqlite.exec(buildRestoreSql({format:4,tables:snapshot}));
  assert.deepEqual(await listSteps(restored,'a',first.id),await listSteps(db,'a',first.id));
  assert.equal((await contextExcerpt(restored,{subjectId:second.id,query:'Ownership'})).notes[0].sourceId,source.sourceId);
  assert.deepEqual(restored.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('Toán 7 respects explicit GDPT and caps a child at band 3',async t=>{
  const db=memoryDb();t.after(()=>db.sqlite.close());
  const child=await newSubject(db,'child','Toán 7','Hình học lớp 7 theo GDPT 2018');
  const framework=frameworkFor({key:'custom',custom:'Kỳ thi riêng'},child.title,child.goal,child.curriculum);
  assert.equal(framework.key,'vn-gdpt-2018-toan');
  assert.equal(framework.levelFrom,'Lớp 7');
  const patch=parseSubjectPatch({revision:child.revision,framework:{key:'vn-gdpt-2018-toan'}});
  const updated=await updateSubject(db,'child',child.id,patch,new Date(stamp));
  assert.equal(updated.framework.topicKey,'vn-gdpt-toan-7');
  assert.equal(db.sqlite.prepare('SELECT roadmap_replan FROM subjects WHERE id=?').get(child.id).roadmap_replan,1);
  seedStep(db,'child',child.id,'triangle','Tam giác','triangle',1,'placed',3);
  seedStep(db,'child',child.id,'proof','Chứng minh','proof',2,'planned',4,['triangle']);
  const steps=await listSteps(db,'child',child.id);
  assert.deepEqual(decideNext({...state(steps),maxDifficulty:3}).difficulty,{min:2,max:3});
  const edit=(changes)=>applyRoadmapChanges(db,{learnerId:'child',subjectId:child.id,changes,jobId:'fake',stamp,
    gate:'1=1',bind:[],resolveSkill:ref=>ref==='proof'?ref:undefined});
  await assert.rejects(edit([{op:'revise',stepId:'triangle',fields:{title:'Đổi'}}]),/chưa mở/);
  await assert.rejects(edit([{op:'append',step:{title:'Hạ độ khó',objective:'Ôn lại',situation:'',skills:['proof'],band:1,kind:'new',requires:[]}}]),/quá một mức/);
});

test('0024 backfills only valid own steps with intact prerequisites and passes integrity checks',t=>{
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  const directory=new URL('../drizzle/',import.meta.url);
  for (const file of readdirSync(directory).filter(name=>name.endsWith('.sql')&&name<'0024').sort())
    sqlite.exec(readFileSync(new URL(file,directory),'utf8'));
  const subject=sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at,roadmap) VALUES(?,?,?,'skill','active','test',?,?,?)");
  const roadmap=JSON.stringify([{title:'First',skills:['skill'],mode:'new'},{title:'Second',skills:['skill'],mode:'new'}]);
  subject.run('mine','a','Deutsch',stamp,stamp,roadmap);
  subject.run('other','b','Rust',stamp,stamp,roadmap);
  sqlite.prepare("INSERT INTO skills(id,subject_id,learner_id,key,name,origin,created_at,updated_at) VALUES('skill','mine','a','key','Skill','ai',?,?)").run(stamp,stamp);
  sqlite.prepare("INSERT INTO learning_lessons(id,user_id,subject_id,payload,assigned_date,updated,completed_at,package_version,kind,roadmap_step_id) VALUES('old-intro','a','mine','{}','2026-11-11',?,?,'2','new','step_1')")
    .run(stamp,stamp);
  for(const file of ['0024_roadmap.sql','0025_knowledge_topics.sql'])sqlite.exec(readFileSync(new URL(file,directory),'utf8'));
  assert.deepEqual(sqlite.prepare('SELECT id,requires FROM roadmap_steps ORDER BY ord').all().map(r=>[r.id,JSON.parse(r.requires)]),[['mine:s1',[]],['mine:s2',['mine:s1']]]);
  assert.equal(sqlite.prepare('SELECT roadmap_replan FROM subjects WHERE id=?').get('other').roadmap_replan,1);
  assert.equal(sqlite.prepare('SELECT status FROM roadmap_steps WHERE id=?').get('mine:s1').status,'practising');
  assert.deepEqual({...sqlite.prepare('SELECT roadmap_step_id,step_role FROM learning_lessons WHERE id=?').get('old-intro')},
    {roadmap_step_id:'mine:s1',step_role:'intro'});
  assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('stepStatus and the SQL writer agree on the listening gate', async t => {
  const db = memoryDb();
  t.after(() => db.sqlite.close());
  const { id } = await newSubject(db, 'adult', 'Deutsch', 'Học A2');
  seedStep(db, 'adult', id, 'step', 'Wortstellung', 'word-order', 1, 'practising');
  db.sqlite.prepare(`INSERT INTO skills(id,subject_id,learner_id,key,name,origin,created_at,updated_at)
    VALUES('word-order',?,'adult','word-order','Wortstellung','user',?,?)`).run(id, stamp, stamp);
  db.sqlite.prepare(`INSERT INTO skill_states(skill_id,learner_id,subject_id,mastery,mastery_ceiling,
    dim_knowledge,dim_recognition,dim_application,dim_retention,attempts_total,evidence_hash,recompute_token,updated_at)
    VALUES('word-order','adult',?,'demonstrated','demonstrated',3,3,3,3,1,'h','x',?)`).run(id, stamp);
  db.sqlite.prepare(`INSERT INTO learning_lessons(id,user_id,subject_id,payload,assigned_date,updated,package_version,kind,roadmap_step_id,step_role)
    VALUES('lesson','adult',?,'{}','2026-11-12',?,'3','new','step','practice')`).run(id, stamp);
  db.sqlite.prepare(`INSERT INTO lesson_items(lesson_id,item_id,learner_id,subject_id,stage,activity,input_kind,skill_ids,
    difficulty,auto_gradable,prompt_hash,origin,payload,created_at)
    VALUES('lesson','i1','adult',?,'independent','apply','short','["word-order"]',1,1,'h','plan','{}',?)`).run(id, stamp);
  db.sqlite.prepare(`INSERT INTO submissions(id,learner_id,lesson_id,client_submission_id,request_hash,status,created_at)
    VALUES('sub','adult','lesson','client','h','graded',?)`).run(stamp);
  db.sqlite.prepare(`INSERT INTO attempts(id,submission_id,learner_id,lesson_id,item_id,subject_id,skill_ids,activity,attempt_no,
    answer,support,context,status,current_grade_id,day,created_at)
    VALUES('attempt','sub','adult','lesson','i1',?,'["word-order"]','apply',1,'ok','none','lesson','graded','grade','2026-11-12',?)`).run(id, stamp);
  db.sqlite.prepare(`INSERT INTO grades(id,attempt_id,grader,result,score,feedback,correction,errors,created_at)
    VALUES('grade','attempt','auto','correct',1,'','','[]',?)`).run(stamp);
  for (const [required, listening, expected] of [
    [1, null, 'practising'], [1, { level: 'emerging', days: ['2026-11-12'] }, 'practising'],
    [1, { level: 'secure', days: ['2026-11-11', '2026-11-12'] }, 'passed'], [0, null, 'passed'],
  ]) {
    db.sqlite.prepare("UPDATE roadmap_steps SET listening=?,status='practising',passed_via=NULL,passed_at=NULL WHERE id='step'").run(required);
    db.sqlite.prepare("UPDATE skill_states SET listening=? WHERE skill_id='word-order'").run(listening ? JSON.stringify(listening) : null);
    const [step] = await listSteps(db, 'adult', id);
    const mastered = new Set(['word-order']);
    const secure = listening?.level === 'secure' ? mastered : new Set();
    assert.equal(stepStatus(step, mastered, [row('word-order')], true, secure), expected);
    await roadmapProgressWrite(db, 'adult', 'lesson', new Date(stamp)).run();
    assert.equal((await listSteps(db, 'adult', id))[0].status, expected);
  }
});

test('listening quotas follow the roadmap mode and the target skills’ listening evidence', () => {
  const planned = { id: 'step', title: 'Hẹn giờ', skills: ['time'], status: 'planned', requires: [], band: 2 };
  const practising = { ...planned, status: 'practising' };
  const listening = { completedLessons: 2, observedSkills: new Set() };
  const practice = { ...state([practising]), listening };
  assert.deepEqual(decideNext({ ...state([planned]), listening }).listening, { min: 1, max: 2 });
  assert.deepEqual(decideNext(practice).listening, { min: 2, max: 3 });
  assert.deepEqual(decideNext({ ...practice, listening: { ...listening, completedLessons: 3 } }).listening, { min: 3, max: 4 });
  assert.deepEqual(decideNext({ ...practice, listening: { completedLessons: 3, observedSkills: new Set(['time']) } }).listening, { min: 2, max: 3 });
  assert.deepEqual(decideNext({ ...practice, independentSkills: new Set(['time']) }).listening, { min: 2, max: 6 });
  assert.deepEqual(decideNext({ ...practice, skills: [{ ...skill('time'), nextReviewDay: '2026-11-01' }] }).listening, { min: 1, max: 2 });
  assert.deepEqual(decideNext(state([practising])).listening, { min: 0, max: 0 });
});
