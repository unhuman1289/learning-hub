import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerFragments, containsAnswer, SentenceFilter, BLOCKED_SENTENCE } from '../lib/tutor/leak.ts';

test('answer fragments include accepted answers, correct choices and solution', () => {
  const answers=answerFragments({key:{accepted:['Guten Tag'],correct:['b']},choices:[{id:'a',text:'falsch'},{id:'b',text:'Richtig'}],solution:'Das ist richtig'});
  assert.deepEqual(answers,['Das ist richtig','Guten Tag','Richtig']);
  assert.equal(containsAnswer('Sag GUTEN, TAG!',answers),true);
  assert.equal(containsAnswer('Das ist RICHTIG!',answers),true);
  assert.equal(containsAnswer('Unrichtig ist es.',answers),false);
});

test('sentences are held across chunks and a split answer never reaches output', () => {
  const output=[]; const filter=new SentenceFilter(['Guten Tag'],(text,blocked)=>output.push({text,blocked}));
  filter.push('Erste Frage. Die Antwort ist gu');
  assert.deepEqual(output,[{text:'Erste Frage.',blocked:false}]);
  filter.push('TEN, tag! Noch eine');
  filter.finish();
  assert.deepEqual(output,[{text:'Erste Frage.',blocked:false},{text:' '+BLOCKED_SENTENCE,blocked:true},{text:' Noch eine',blocked:false}]);
});
