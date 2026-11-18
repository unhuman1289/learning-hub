import test from 'node:test';
import assert from 'node:assert/strict';
import { startFeedbackPolling } from '../app/hub/lesson/feedback-poll.ts';

function harness() {
 let now=0, visible=true, callback, timer, id=0, reads=0;
 const stopped = startFeedbackPolling({ startedAt:0, now:()=>now, visible:()=>visible,
  subscribe:fn=>{callback=fn;return()=>{callback=undefined}},
  schedule:(fn,delay)=>{timer={fn,delay,id:++id};return timer.id}, cancel:()=>{timer=undefined},
  read:async()=>{reads++} });
 return { get timer(){return timer}, get reads(){return reads},
  setTime:value=>{now=value}, setVisible:value=>{visible=value;callback()},
  fire:async()=>{const fn=timer.fn;timer=undefined;fn();await Promise.resolve();await Promise.resolve()}, stopped };
}
test('polls at two seconds until 30 seconds, then at five seconds', async()=>{
 const h=harness(); assert.equal(h.timer.delay,2000); h.setTime(28000); await h.fire(); assert.equal(h.reads,1); assert.equal(h.timer.delay,2000);
 h.setTime(30000); await h.fire(); assert.equal(h.timer.delay,5000); h.stopped(); assert.equal(h.timer,undefined);
});
test('hidden tab cancels polling, becoming visible refreshes once, cleanup stops it', async()=>{
 const h=harness(); h.setVisible(false); assert.equal(h.timer,undefined); assert.equal(h.reads,0);
 h.setTime(35000); h.setVisible(true); await Promise.resolve(); await Promise.resolve(); assert.equal(h.reads,1); assert.equal(h.timer.delay,5000);
 h.stopped(); assert.equal(h.timer,undefined);
});
test('a hidden tab does not queue requests when an in-flight read finishes', async()=>{
 let finish, changed, visible=true, scheduled=0;
 const stop=startFeedbackPolling({startedAt:0,now:()=>0,visible:()=>visible,subscribe:fn=>{changed=fn;return()=>{}},schedule:()=>{scheduled++;return 1},cancel:()=>{},read:()=>new Promise(resolve=>{finish=resolve})});
 changed(); visible=false; changed(); finish(); await Promise.resolve(); await Promise.resolve(); assert.equal(scheduled,1); stop();
});
