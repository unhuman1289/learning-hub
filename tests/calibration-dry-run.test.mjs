import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calibrationContext} from '../lib/calibration/context.mjs';
import {calibrationDryRun} from '../lib/calibration/dry-run.mjs';
import {rubricIssues} from '../lib/ai-jobs/apply/rubric.ts';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/eval/assess/deutsch.json',import.meta.url)));

test('calibration dry run applies the real rubric tolerance and preserves validator detail',async()=>{
 const context=await calibrationContext(fixture,fixture.submissions[0],'job_00000000000000000000');
 const grades=context.attempts.map(a=>({attemptId:a.attemptId,result:'incorrect',score:0,rubricScores:a.rubric.map(r=>({criterion:r.criterion,points:0,max:r.points})),feedback:'Hãy thử lại.',correction:'',errors:[],checkItem:null}));
 const result={contract:'assess-result/1',contextHash:context.contextHash,summary:'',grades,diagnosis:[],masteryProposals:[],errorPatternUpdates:[],reviewProposals:[],recheckDecision:null,usage:{model:'fake',inputTokens:1,outputTokens:1,ms:1}};
 let issues=await calibrationDryRun(context,result);assert.deepEqual(issues,[]);
 const index=context.attempts.findIndex(a=>a.rubric.reduce((n,r)=>n+r.points,0)===3);
 assert.notEqual(index,-1);
 const grade=grades[index], rubric=context.attempts[index].rubric;
 const one=rubric.findIndex(r=>r.points===1);
 grade.rubricScores[one].points=1; grade.score=0.333; grade.result='partial';
 issues=await calibrationDryRun(context,result);assert.deepEqual(issues,[]);
 grade.rubricScores[0].criterion=grade.rubricScores[0].criterion.toUpperCase();
 issues=await calibrationDryRun(context,result);
 assert.deepEqual(issues,[]);
 assert.deepEqual(rubricIssues(grade,context.attempts[index],'/grades/'+index),[]);
 grade.rubricScores.pop();
 issues=await calibrationDryRun(context,result);
 assert.ok(issues.some(x=>x.detail==='rubric_count'));
});
