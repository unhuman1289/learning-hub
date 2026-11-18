import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memoryDb} from './d1-adapter.mjs';
import {enqueueCalibration} from '../lib/calibration/jobs.ts';
import {consumeCalibration, recoverCalibrationJobs} from '../build/calibration-queue.ts';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/eval/assess/deutsch.json',import.meta.url)));

test('Queue grades eight submissions with Luna, counts before fetch, saves and warns',async()=>{
 const db=memoryDb(),env={OPENAI_ENABLED:'true',OPENAI_API_KEY:'fake',AI_QUEUE:{send:async()=>{}}};
 const job=await enqueueCalibration(db,env);let calls=0;
 const fetcher=async (_url,options)=>{
  const request=JSON.parse(options.body); assert.equal(request.model,'gpt-6-luna');assert.equal(request.instructions,'real assess prompt');
  assert.equal(db.sqlite.prepare('SELECT calls FROM calibration_jobs WHERE id=?').get(job.id).calls,++calls);
  const context=JSON.parse(request.input.split('\n')[2]);const sub=fixture.submissions[calls-1];
  const grades=context.attempts.map(a=>({attemptId:a.attemptId,result:sub.answers[a.itemId].injection?'ungradable':sub.answers[a.itemId].expected,score:1,rubricScores:[],feedback:'',correction:'',errors:[],checkItem:null}));
  const result={contract:'assess-result/1',contextHash:context.contextHash,summary:'',grades,diagnosis:[],masteryProposals:[],errorPatternUpdates:[],reviewProposals:[],recheckDecision:null,usage:{model:'fake',inputTokens:1,outputTokens:1,ms:1}};
  return Response.json({status:'completed',model:'gpt-6-luna',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],usage:{input_tokens:10,output_tokens:5}});
 };
 assert.equal(await consumeCalibration(db,env,job.id,'real assess prompt',fetcher),'succeeded');
 assert.equal(calls,8); const row=db.sqlite.prepare('SELECT * FROM grader_calibrations').get();
 assert.equal(row.n,32);assert.equal(row.input_tokens,80);assert.ok(row.injection_shifted>0);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM alert_events WHERE code='grader_calibration_low'").get().n,1);
 assert.equal(await consumeCalibration(db,env,job.id,'real assess prompt',fetcher),'not-claimed');assert.equal(calls,8);
 db.sqlite.close();
});
test('expired calibration lease fails and is never replayed',async()=>{
 const db=memoryDb(),env={OPENAI_ENABLED:'true',OPENAI_API_KEY:'fake',AI_QUEUE:{send:async()=>assert.fail()}};
 db.sqlite.prepare("INSERT INTO calibration_jobs(id,kind,status,calls,lease_token,lease_expires_at,created_at,updated_at) VALUES('cal_x','calibrate','leased',1,'t','2026-01-01','2026-01-01','2026-01-01')").run();
 await recoverCalibrationJobs(db,env,new Date('2026-11-01T00:00:00Z'));
 assert.equal(db.sqlite.prepare('SELECT status FROM calibration_jobs').get().status,'failed');db.sqlite.close();
});
