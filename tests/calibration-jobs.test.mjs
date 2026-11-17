import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memoryDb} from './d1-adapter.mjs';
import {claimCalibration, enqueueCalibration, reserveCalibrationCall} from '../lib/calibration/jobs.ts';

test('concurrent requests share a job, a lease is exclusive, and exactly eight calls can be reserved', async () => {
  const db = memoryDb(), env = {OPENAI_ENABLED:'true', AI_QUEUE:{send: async () => {}}};
  const [a,b] = await Promise.all([enqueueCalibration(db,env),enqueueCalibration(db,env)]);
  assert.equal(a.id,b.id);
  const [token,other] = await Promise.all([claimCalibration(db,a.id),claimCalibration(db,a.id)]);
  assert.ok(token); assert.equal(other,null);
  const reservations = await Promise.allSettled(Array.from({length:12},()=>reserveCalibrationCall(db,a.id,token)));
  assert.equal(reservations.filter(x=>x.status==='fulfilled').length,8);
  assert.equal(db.sqlite.prepare('SELECT calls FROM calibration_jobs WHERE id=?').get(a.id).calls,8);
  db.sqlite.close();
});
test('schedule replay does not create another job after completion', async () => {
  const db=memoryDb(), env={OPENAI_ENABLED:'true',AI_QUEUE:{send:async()=>{}}};
  const first=await enqueueCalibration(db,env,'2026-11-22');
  db.sqlite.prepare("UPDATE calibration_jobs SET status='succeeded' WHERE id=?").run(first.id);
  const replay=await enqueueCalibration(db,env,'2026-11-22');
  assert.equal(replay.id,first.id);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM calibration_jobs').get().n,1);
  db.sqlite.close();
});
