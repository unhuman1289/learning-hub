import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackSignal } from '../build/feedback-signal.ts';
import { notifySavedFeedback } from '../lib/ai-jobs/feedback-signal.ts';

test('signal broadcasts no learner content and closes subscribers', async () => {
 const channel = new FeedbackSignal();
 const response = await channel.fetch(new Request('https://feedback.internal/events'));
 const reader = response.body.getReader();
 assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
 assert.equal((await channel.fetch(new Request('https://feedback.internal/saved', {method:'POST'}))).status,204);
 assert.equal(new TextDecoder().decode((await reader.read()).value), 'event: saved\ndata: {}\n\n');
 assert.equal((await reader.read()).done,true);
});
test('signal can be cancelled without breaking later notifications', async () => {
 const channel = new FeedbackSignal();
 const response = await channel.fetch(new Request('https://feedback.internal/events'));
 await response.body.cancel();
 assert.equal((await channel.fetch(new Request('https://feedback.internal/saved',{method:'POST'}))).status,204);
});
test('notification follows only a verified succeeded assess job and carries no data', async () => {
 let path, call;
 const namespace={idFromName:n=>{path=n;return n},get:()=>({fetch:async (...args)=>{call=args}})};
 let row={learner_id:'learner',context_snapshot:JSON.stringify({lesson:{lessonId:'les_aaaaaaaaaaaaaaaaaaaa'}})};
 const db={prepare:sql=>({bind:()=>({first:async()=>{assert.match(sql,/status='succeeded'/);return row}})})};
 await notifySavedFeedback(namespace,db,'job_aaaaaaaaaaaaaaaaaaaa');
 assert.equal(path,'learner:les_aaaaaaaaaaaaaaaaaaaa');
 assert.deepEqual(call,['https://feedback.internal/saved',{method:'POST'}]);
 row=null; call=undefined; await notifySavedFeedback(namespace,db,'job_aaaaaaaaaaaaaaaaaaaa'); assert.equal(call,undefined);
});
