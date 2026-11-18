import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessIssue} from '../build/openai-queue.ts';

test('assessment diagnostics allow known schema paths but redact untrusted parts',()=>{
 assert.equal(assessIssue({event:'contract_error',errors:[{code:'invalid_type',path:'/grades/0/rubricScores'}]}),'contract_error:invalid_type /grades/0/rubricScores');
 assert.equal(assessIssue({event:'dry_run_422',errors:['schema /grades/0/private-answer']}),'dry_run_422:schema /grades/0/*');
 assert.equal(assessIssue({event:'engine_error',errors:['private text']}),'engine_error');
});

test('short answers permit a verbatim quote or no diagnostic, never invented evidence', async ()=>{
 const {checkGradeEvidence}=await import('../lib/ai-jobs/apply/evidence.ts');
 for(const answer of ['ok lah','I like turtles','']) {
  const grade={feedback:'Hãy thử theo yêu cầu.',errors:[]};
  assert.equal(checkGradeEvidence(grade,answer,false).invalid,false);
  if(answer) {
   assert.equal(checkGradeEvidence({...grade,errors:[{evidence:answer}]},answer,false).invalid,false);
   assert.equal(checkGradeEvidence({...grade,errors:[{evidence:'invented text'}]},answer,false).invalid,true);
  } else assert.equal(checkGradeEvidence({...grade,errors:[{evidence:''}]},answer,false).invalid,true);
 }
});
