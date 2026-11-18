import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryState, summaryScore } from '../lib/lesson-v2/summary-state.ts';
const attempts = [{result:'correct'}, {result:null}, {result:'incorrect'}];
test('checking reports only pending answers and never invents an ETA', () => {
 const s = summaryState(attempts, true, false, false, false, '');
 assert.equal(s.phase, 'checking'); assert.equal(s.pet, 'think'); assert.match(s.message, /1 câu viết/); assert.doesNotMatch(s.message, /giây/);
});
test('queued or slow reassures without claiming a result', () => {
 for (const [queued, slow] of [[true,false],[false,true]]) { const s = summaryState(attempts,true,queued,slow,false,''); assert.equal(s.phase,'queued'); assert.equal(s.pet,'busy'); assert.match(s.message,/đã lưu/); }
});
test('graded counts corrections and praises child before suggesting fixes', () => {
 const rows = [{result:'correct'}, {result:'incorrect'}, {result:'partial'}];
 const s = summaryState(rows,false,false,false,true,'Ếch');
 assert.equal(s.phase,'graded'); assert.equal(s.correct,1); assert.deepEqual(s.corrections,[1,2]); assert.equal(s.pet,'cheer'); assert.match(s.message,/^Ếch giỏi quá!.*2 câu/);
 assert.equal(summaryState(rows,false,false,false,false,'').pet,'nod');
});
test('an unanswered review is not graded', () => assert.equal(summaryState([undefined],false,false,false,false,'').phase,'review'));
test('stopped grading with a missing result is not presented as complete', () => assert.equal(summaryState(attempts,false,false,false,false,'').phase,'unavailable'));
test('partial lesson feedback asks the learner to finish the blank questions', () => {
 const s = summaryState([{result:'incorrect'}, undefined, undefined, undefined, undefined],false,false,false,false,'',4);
 assert.equal(s.correct,0); assert.equal(s.message,'Con chấm xong câu đã làm rồi nè. Còn 4 câu chưa làm, làm tiếp rồi nộp lại nha.');
});

test('partial scores do not count blank questions as wrong', () => {
 assert.equal(summaryScore(0,1,5,4), '0/1 câu đã làm đúng · 4 câu chưa làm');
 assert.equal(summaryScore(4,5,5,0), '4/5 câu đúng');
});
