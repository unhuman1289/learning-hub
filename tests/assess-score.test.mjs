import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deriveAssessScores} from '../lib/ai-jobs/apply/derive-score.ts';
import {readFileSync} from 'node:fs';
import {calibrationContext} from '../lib/calibration/context.mjs';
import {calibrationDryRun} from '../lib/calibration/dry-run.mjs';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/eval/assess/deutsch.json',import.meta.url)));
test('Hub derives score and result only from complete valid rubric scores and preserves ungradable',async()=>{
 const context=await calibrationContext(fixture,fixture.submissions[0],'job_00000000000000000000');
 const grades=context.attempts.map(a=>({attemptId:a.attemptId,result:'correct',score:1,rubricScores:a.rubric.map(r=>({criterion:r.criterion,points:0,max:r.points})),feedback:'ok',correction:'',errors:[],checkItem:null}));
 const result={contract:'assess-result/1',contextHash:context.contextHash,summary:'',grades,diagnosis:[],masteryProposals:[],errorPatternUpdates:[],reviewProposals:[],recheckDecision:null,usage:{model:'fake',inputTokens:1,outputTokens:1,ms:1}};
 const derived=deriveAssessScores(result,context);assert.equal(derived.grades[0].result,'incorrect');assert.equal(derived.grades[0].score,0);
 assert.deepEqual(await calibrationDryRun(context,derived),[]);
 const partial=structuredClone(result);const a=context.attempts[0];partial.grades[0].rubricScores[0].points=a.rubric[0].points;
 const p=deriveAssessScores(partial,context).grades[0];assert.equal(p.result,'partial');assert.equal(p.score,a.rubric[0].points/a.rubric.reduce((n,r)=>n+r.points,0));
 const blank=structuredClone(result);blank.grades[0].result='ungradable';blank.grades[0].score=0;blank.grades[0].rubricScores=[];
 assert.equal(deriveAssessScores(blank,context).grades[0].result,'ungradable');
 const bad=structuredClone(result);bad.grades[0].rubricScores[0].max+=1;assert.equal(deriveAssessScores(bad,context).grades[0].rubricScores[0].max,context.attempts[0].rubric[0].points);
});

test('cleanup removes auto diagnoses and invalid check items, repairs max without accepting bad points or missing criteria',async()=>{
 const context=await calibrationContext(fixture,fixture.submissions[0],'job_00000000000000000000');
 const a=context.attempts[0];context.attempts.push({...structuredClone(a),attemptId:'auto',itemId:'i2',autoGrade:{result:'correct',expected:'',chosenErrorLabel:null}});
 const result={diagnosis:[{attemptId:'auto',errors:[]},{attemptId:'other',errors:[]}],grades:[{attemptId:a.attemptId,result:'correct',score:1,rubricScores:a.rubric.map(r=>({criterion:r.criterion,points:0,max:0})),checkItem:{id:'bad id'},errors:[]}]};
 const events=[],clean=deriveAssessScores(result,context,code=>events.push(code));
 assert.deepEqual(clean.diagnosis,[{attemptId:'other',errors:[]}]);assert.equal(clean.grades[0].checkItem,null);
 assert.deepEqual(clean.grades[0].rubricScores.map(x=>x.max),a.rubric.map(x=>x.points));assert.equal(clean.grades[0].result,'incorrect');
 assert.ok(events.includes('auto_diagnosis'));assert.ok(events.includes('rubric_max'));assert.ok(events.includes('check_item'));
 const negative=structuredClone(result);negative.grades[0].rubricScores[0].points=-1;
 assert.equal(deriveAssessScores(negative,context).grades[0].rubricScores[0].points,-1);
 const missing=structuredClone(result);missing.grades[0].rubricScores.pop();
 assert.equal(deriveAssessScores(missing,context).grades[0].rubricScores.length,a.rubric.length-1);
});

test('over-long verbatim evidence is shortened to a prefix instead of rejecting the submission',async()=>{
 const context=await calibrationContext(fixture,fixture.submissions[0],'job_00000000000000000000');
 const a=context.attempts[0],long='Ich lerne Deutsch, weil ich will arbeiten in Deutschland und später dort mit meiner Familie wohnen möchte.';
 const grades=context.attempts.map(x=>({attemptId:x.attemptId,result:'correct',score:1,rubricScores:x.rubric.map(r=>({criterion:r.criterion,points:r.points,max:r.points})),feedback:'ok',correction:'',errors:[],checkItem:null}));
 grades[0].errors=[{category:'grammar',message:'Sai vị trí động từ.',evidence:long}];
 const result={contract:'assess-result/1',contextHash:context.contextHash,summary:'',grades,diagnosis:[],masteryProposals:[],errorPatternUpdates:[],reviewProposals:[],recheckDecision:null,usage:{model:'fake',inputTokens:1,outputTokens:1,ms:1}};
 const codes=[];const derived=deriveAssessScores(result,context,c=>codes.push(c));
 const evidence=derived.grades[0].errors[0].evidence;
 assert.ok(evidence.length<=80);assert.ok(long.startsWith(evidence));assert.deepEqual(codes,['evidence_trim']);
 assert.equal(a.attemptId,derived.grades[0].attemptId);
});
