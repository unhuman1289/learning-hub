import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeSkillState,evidenceStrength,clampReviewDays,clampMastery,normalizeErrorLabel,addDays,canResolveError} from '../lib/learner-model/rules.ts';
const now=new Date('2026-10-13T12:00:00Z');
const evidence=(id,day,changes={})=>({id,submissionId:'sub-'+id,at:`2026-10-${String(day).padStart(2,'0')}T08:00:00Z`,activity:'create',result:'correct',support:'none',attemptNo:1,status:'graded',context:'lesson',stage:'independent',...changes});
const compute=rows=>computeSkillState(rows,now);
for(const [name,changes,strength]of[
 ['first independent answer',{},3],['unsupported retry',{attemptNo:2},2],['partial',{result:'partial'},2],
 ['hint one',{support:'hint1'},1],['hint two',{support:'hint2'},1],['wrong with hint',{support:'hint1',result:'incorrect'},0],
 ['solution viewed',{support:'solution'},0],['unreadable',{result:'ungradable'},null],['pending',{status:'pending'},null],
 ['disputed',{status:'disputed'},null],['void',{status:'void'},null],['invalidated item',{itemVoid:true},null]
])test('evidence: '+name,()=>assert.equal(evidenceStrength(evidence('a',12,changes)),strength));

test('recognition success cannot prove application',()=>{
 const rows=Array.from({length:40},(_,i)=>evidence('r'+i,i<20?11:12,{activity:'recognize'}));
 rows.push(evidence('create',12,{result:'incorrect'}));
 const x=compute(rows);assert.equal(x.dimensions.recognition,3);assert.equal(x.dimensions.application,1);assert.equal(x.mastery,'developing');assert.equal(x.stuckOn,'recognize');
});
test('independent work on separate days plus understanding demonstrates skill',()=>{
 const rows=[evidence('k',10,{activity:'explain'}),evidence('a',11),evidence('b',12)];
 assert.equal(compute(rows).mastery,'demonstrated');
 rows.push(evidence('fail',13,{result:'incorrect'}));
 const x=compute(rows);assert.equal(x.mastery,'needs_review');assert.equal(x.review.intervalDays,1);
});
test('four dimensions: one E2 remains 1; two E2 give 2; E3 on one day gives 2',()=>{
 assert.equal(compute([evidence('a',12,{result:'partial'})]).dimensions.application,1);
 assert.equal(compute([evidence('a',12,{result:'partial'}),evidence('b',12,{attemptNo:2})]).dimensions.application,2);
 assert.equal(compute([evidence('a',12),evidence('b',12)]).dimensions.application,2);
});
test('latest submission with a wrong answer cannot get level 3 from ID order',()=>{
 const rows=[evidence('old',11),evidence('a-fail',12,{submissionId:'same',result:'incorrect'}),evidence('z-pass',12,{submissionId:'same'})];
 assert.equal(compute(rows).dimensions.application,2);
});
test('no evidence, hint-only and old evidence have honest ceilings',()=>{
 assert.equal(compute([]).mastery,'not_assessed');
 assert.equal(compute([evidence('h',12,{support:'hint1'})]).mastery,'introduced');
 const old=evidence('old',1,{at:'2026-07-01T08:00:00Z'});assert.equal(compute([old]).dimensions.application,0);
 assert.equal(compute([old]).attemptsTotal,1);
});
test('dimension window excludes exactly 60 calendar days and future answers',()=>{
 const x=compute([evidence('a',1,{at:'2026-08-14T08:00:00Z'}),evidence('future',14)]);
 assert.equal(x.dimensions.application,0);assert.equal(x.attemptsTotal,1);
});
test('disputed, void and unreadable answers cannot create errors or exposure',()=>{
 const rows=['disputed','void','pending'].map((status,i)=>evidence('a'+i,12,{status,errors:[{label:'wrong',category:'knowledge'}]}));
 rows.push(evidence('unreadable',12,{result:'ungradable'}));
 const x=compute(rows);assert.equal(x.attemptsTotal,0);assert.deepEqual(x.errors,[]);assert.deepEqual(x.exposure,{});
});
test('same evidence replay is stable; conflicting IDs and invalid timestamps are rejected',()=>{
 const a=evidence('a',12);assert.deepEqual(compute([a,a]),compute([a]));
 assert.throws(()=>compute([a,{...a,result:'incorrect'}]),/Conflicting/);
 assert.throws(()=>compute([{...a,at:'bad'}]),/Invalid/);
 assert.deepEqual(compute([evidence('b',12),evidence('a',11)]),compute([evidence('a',11),evidence('b',12)]));
});
test('retention needs delayed tests and another 14 calendar days',()=>{
 const at=(id,date)=>evidence(id,1,{at:date+'T08:00:00Z'});
 assert.equal(compute([at('a','2026-09-01'),at('b','2026-09-05')]).dimensions.retention,0);
 assert.equal(compute([at('a','2026-09-01'),at('b','2026-09-06')]).dimensions.retention,2);
 assert.equal(compute([at('a','2026-09-01'),at('b','2026-09-06'),at('c','2026-09-20')]).dimensions.retention,3);
 assert.equal(compute([at('a','2026-09-01'),{...at('b','2026-09-06'),support:'hint1'}]).dimensions.retention,1);
});
test('review initializes at 3 days and only increases once per Berlin day',()=>{
 let rows=[evidence('a',10)];let x=compute(rows);assert.equal(x.review.intervalDays,3);assert.equal(x.review.nextReviewDay,'2026-10-13');
 rows.push(evidence('b',11),evidence('c',11));x=compute(rows);assert.equal(x.review.intervalDays,7);assert.equal(x.review.nextReviewDay,'2026-10-18');
 rows.push(evidence('d',12));assert.equal(compute(rows).review.intervalDays,14);
});
test('partial work does not keep postponing a due review',()=>{
 const x=compute([evidence('a',10),evidence('b',13,{result:'partial'})]);
 assert.equal(x.review.intervalDays,3);assert.equal(x.review.nextReviewDay,'2026-10-13');
});
test('review failure resets, hint retreats, guided work cannot advance',()=>{
 const x=compute([evidence('a',9),evidence('b',10),evidence('c',11,{support:'hint1'})]);assert.equal(x.review.intervalDays,3);
 const y=compute([evidence('a',9),evidence('b',10,{stage:'guided'}),evidence('c',11,{result:'incorrect'})]);assert.equal(y.review.intervalDays,1);
 const z=compute([evidence('a',10),evidence('b',11),evidence('c',11,{result:'incorrect'}),evidence('d',11)]);assert.equal(z.review.intervalDays,1);
});
test('success at the 60-day step stops review; later failure reopens it',()=>{
 const rows=Array.from({length:6},(_,i)=>evidence('a'+i,7+i));
 const x=compute(rows);assert.equal(x.review.intervalDays,60);assert.equal(x.review.maintained,true);assert.equal(x.review.nextReviewDay,null);
 rows.push(evidence('fail',13,{result:'incorrect'}));assert.equal(compute(rows).review.maintained,false);assert.equal(compute(rows).review.intervalDays,1);
});
test('overdue more than half interval requests review, not at exact boundary',()=>{
 const rows=[evidence('k',8,{activity:'explain',stage:'guided'}),evidence('a',8,{stage:'guided'})];
 assert.equal(computeSkillState(rows,new Date('2026-10-12T12:00:00Z')).mastery,'developing');
 assert.equal(compute(rows).mastery,'needs_review');
});
test('error normalization merges punctuation and case but does not discard accents',()=>{
 assert.equal(normalizeErrorLabel(' Verb-Ende! '),'verb ende');assert.notEqual(normalizeErrorLabel('können'),normalizeErrorLabel('konnen'));
 const x=compute([evidence('a',11,{result:'incorrect',errors:[{label:'Verb-Ende!',category:'application'}]}),evidence('b',12,{result:'incorrect',errors:[{label:'verb ende',category:'application'}]})]);
 assert.equal(x.errors.length,1);assert.equal(x.errors[0].confidence,'confirmed');assert.equal(x.errors[0].daysSeen,2);
});
test('same-day repeated errors stay suspected and count once per attempt',()=>{
 const err={label:'Verb order',category:'knowledge'};
 const x=compute([evidence('a',12,{result:'incorrect',errors:[err,err]}),evidence('b',12,{result:'incorrect',errors:[err]})]);
 assert.equal(x.errors[0].occurrences,2);assert.equal(x.errors[0].confidence,'suspected');
});
test('slip requires another independent E3 of same skill in same submission',()=>{
 const a=evidence('a',12,{submissionId:'s',result:'incorrect',errors:[{label:'Arithmetic slip',category:'slip'}]});
 assert.equal(compute([a]).errors[0].category,'unknown');
 assert.equal(compute([a,evidence('b',12,{submissionId:'other'})]).errors[0].category,'unknown');
 assert.equal(compute([a,evidence('b',12,{submissionId:'s'})]).errors[0].category,'slip');
});
test('two clean E2 improve; independent E3 on two later days resolve; recurrence reopens',()=>{
 const err={label:'Verb order',category:'application'};
 const rows=[evidence('a',8,{result:'incorrect',errors:[err]}),evidence('b',9,{result:'incorrect',errors:[err]}),evidence('c',10,{result:'partial'}),evidence('d',10,{result:'partial'})];
 assert.equal(compute(rows).errors[0].status,'improving');
 rows.push(evidence('e',11),evidence('f',12));assert.equal(compute(rows).errors[0].status,'resolved');
 rows.push(evidence('g',13,{result:'incorrect',errors:[err]}));const x=compute(rows);assert.equal(x.errors[0].status,'open');assert.equal(x.errors[0].confidence,'confirmed');assert.equal(x.review.kind,'remediation');
});
test('confirmed knowledge/application errors cap mastery, suspected does not',()=>{
 const err={label:'Rule',category:'knowledge'};
 const rows=[evidence('k',10,{activity:'explain'}),evidence('a',11,{errors:[err]}),evidence('b',12,{errors:[err]})];
 assert.equal(compute(rows).mastery,'developing');assert.equal(compute(rows.slice(0,2)).errors[0].confidence,'suspected');
});
test('examples retain at most 5 real attempts, without mutating input',()=>{
 const rows=Array.from({length:7},(_,i)=>evidence('a'+i,10,{errors:[{label:'rule',category:'unknown'}]}));
 const before=JSON.stringify(rows),x=compute(rows);assert.equal(x.errors[0].exampleAttemptIds.length,5);assert.equal(JSON.stringify(rows),before);
});
test('stuckOn threshold respects 14-day window and application >=2',()=>{
 const rows=Array.from({length:8},(_,i)=>evidence('a'+i,11,{activity:'recognize'}));assert.equal(compute(rows).stuckOn,'recognize');
 assert.equal(compute(rows.slice(0,7)).stuckOn,null);rows.push(evidence('apply',12));assert.equal(compute(rows).stuckOn,null);
});
test('Berlin DST and midnight use calendar days, not 24-hour elapsed offsets',()=>{
 assert.equal(addDays('2026-03-28',3),'2026-03-31');assert.equal(addDays('2026-10-24',3),'2026-10-27');
 const rows=[evidence('a',1,{at:'2026-10-24T22:30:00Z'}),evidence('b',1,{at:'2026-10-25T01:30:00Z'})];
 const x=computeSkillState(rows,new Date('2026-10-25T12:00:00Z'));assert.equal(x.review.intervalDays,3);assert.equal(x.review.stepDay,'2026-10-25');
});
test('AI proposals cannot raise mastery or invent an unbounded review interval',()=>{
 assert.deepEqual(clampMastery('demonstrated','introduced'),{mastery:'introduced',clipped:true});
 assert.deepEqual(clampMastery('introduced','demonstrated'),{mastery:'introduced',clipped:false});
 assert.equal(clampMastery('needs_review','introduced').mastery,'needs_review');
 assert.equal(clampReviewDays(0,7),4);assert.equal(clampReviewDays(1000,7),14);assert.equal(clampReviewDays(1000,60),60);
 assert.throws(()=>clampReviewDays(NaN,7));assert.throws(()=>clampReviewDays(5,2));
});

test('repeated failures keep review needed after prior demonstration',()=>{
 const rows=[evidence('k',9,{activity:'explain'}),evidence('a',10),evidence('b',11),evidence('bad1',12,{result:'incorrect'}),evidence('bad2',13,{result:'incorrect'})];
 assert.equal(compute(rows).mastery,'needs_review');
});
test('same-sitting positive evidence cannot cancel a last-submission failure',()=>{
 const rows=[evidence('k',9,{activity:'explain'}),evidence('a',10),evidence('b',11),evidence('bad',13,{submissionId:'mixed',result:'incorrect'}),evidence('good',13,{submissionId:'mixed'})];
 assert.equal(compute(rows).mastery,'needs_review');
});

test('AI resolution needs 14 error-free days and actual clean positive evidence',()=>{
 const rows=[evidence('bad',1,{result:'incorrect',errors:[{label:'Rule',category:'knowledge'}]}),evidence('good',4,{result:'partial'})];
 const pattern=compute(rows).errors[0];
 assert.equal(canResolveError(pattern,rows,['good'],new Date('2026-10-14T12:00:00Z')),false);
 assert.equal(canResolveError(pattern,rows,['good'],new Date('2026-10-15T12:00:00Z')),true);
 assert.equal(canResolveError(pattern,rows,['missing'],new Date('2026-10-15T12:00:00Z')),false);
 assert.equal(canResolveError(pattern,rows,['bad'],new Date('2026-10-15T12:00:00Z')),false);
 rows.push(evidence('again',12,{result:'incorrect',errors:[{label:'Rule',category:'knowledge'}]}));
 assert.equal(canResolveError(pattern,rows,['good'],new Date('2026-10-15T12:00:00Z')),false);
});
