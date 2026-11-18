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
 const bad=structuredClone(result);bad.grades[0].rubricScores[0].max+=1;assert.equal(deriveAssessScores(bad,context).grades[0].rubricScores[0].max,bad.grades[0].rubricScores[0].max);
});
