import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runCalibration} from '../lib/calibration/run.mjs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/eval/assess/deutsch.json', import.meta.url)));

test('synthetic submissions pass through the real assess pipeline and supplied Luna prompt', async () => {
  let calls = 0;
  const engine = {name: 'openai', vision: false, async run({system, user}) {
    assert.equal(system, 'Luna prompt');
    const context = JSON.parse(user.split('\n')[2]);
    const submission = fixture.submissions[calls++];
    const grades = context.attempts.map(a => ({attemptId: a.attemptId, result: submission.answers[a.itemId].expected,
      score: submission.answers[a.itemId].expected === 'correct' ? 1 : submission.answers[a.itemId].expected === 'incorrect' || submission.answers[a.itemId].expected === 'ungradable' ? 0 : 0.5, rubricScores: a.rubric.map(r => ({criterion:r.criterion,max:r.points,points:r.points * (submission.answers[a.itemId].expected === 'correct' ? 1 : submission.answers[a.itemId].expected === 'incorrect' || submission.answers[a.itemId].expected === 'ungradable' ? 0 : 0.5)})), feedback: 'ok', correction: '', errors: [], checkItem: null}));
    return {json: {contract: 'assess-result/1', summary: '', grades, diagnosis: [], masteryProposals: [],
      errorPatternUpdates: [], reviewProposals: [], recheckDecision: null}, usage: {model: 'fake-luna', inputTokens: 10, outputTokens: 5, ms: 20}};
  }};
  const metrics = await runCalibration(fixture, 'job_00000000000000000000', engine, 'Luna prompt');
  assert.equal(calls, 8);
  assert.equal(metrics.n, 32);
  assert.equal(metrics.agreement, 1);
  assert.equal(metrics.inputTokens, 80);
});

test('one invalid submission is counted once and all eight submissions are processed', async () => {
 let calls=0;
 const engine={name:'openai',vision:false,async run({user}){
  const context=JSON.parse(user.split('\n')[2]),submission=fixture.submissions[calls++];
  const grades=context.attempts.map(a=>({attemptId:a.attemptId,result:submission.answers[a.itemId].expected,score:submission.answers[a.itemId].expected==='correct'?1:submission.answers[a.itemId].expected==='incorrect'||submission.answers[a.itemId].expected==='ungradable'?0:0.5,rubricScores:a.rubric.map(r=>({criterion:r.criterion,max:r.points,points:r.points*(submission.answers[a.itemId].expected==='correct'?1:submission.answers[a.itemId].expected==='incorrect'||submission.answers[a.itemId].expected==='ungradable'?0:0.5)})),feedback:'ok',correction:'',errors:[],checkItem:null}));
  if(calls===3)grades[0].rubricScores='invalid';
  return {json:{contract:'assess-result/1',summary:'',grades,diagnosis:[],masteryProposals:[],errorPatternUpdates:[],reviewProposals:[],recheckDecision:null},usage:{model:'fake',inputTokens:10,outputTokens:5,ms:20}};
 }};
 const metrics=await runCalibration(fixture,'job_00000000000000000000',engine,'prompt');
 assert.equal(calls,8);assert.equal(metrics.invalid,1);assert.equal(metrics.agreement,28/32);assert.equal(metrics.inputTokens,80);
});
