import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryState, summaryScore } from '../lib/lesson-v2/summary-state.ts';
const attempts = [{result:'correct'}, {result:'incorrect'}, {result:'partial'}, undefined];

test('graded summary counts correct answers and corrections', () => {
 assert.deepEqual(summaryState(attempts,false), {graded:true,correct:1,corrections:[1,2]});
});

test('waiting, missing results and an unanswered review are not shown as graded', () => {
 assert.equal(summaryState(attempts,true).graded,false);
 assert.equal(summaryState([...attempts,{result:null}],false).graded,false);
 assert.equal(summaryState([undefined],false).graded,false);
});

test('partial scores do not count blank questions as wrong', () => {
 assert.equal(summaryScore(0,1,5,4), '0/1 câu đã làm đúng · 4 câu chưa làm');
 assert.equal(summaryScore(4,5,5,0), '4/5 câu đúng');
});
