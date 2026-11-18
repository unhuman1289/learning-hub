import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerFragments, containsAnswer, SentenceFilter, BLOCKED_SENTENCE } from '../lib/tutor/leak.ts';

const fragments=(...texts)=>({texts,labels:[]});
test('accepted, correct option text, solution and ordered labels are checked', () => {
  const answers=answerFragments({key:{accepted:['Guten Tag'],correct:['a']},choices:[{id:'b',text:'falsch'},{id:'a',text:'Richtig'}],solution:'Das ist richtig'});
  assert.deepEqual(answers.texts,['Das ist richtig','Guten Tag']); assert.deepEqual(answers.labels,['B']);
  for (const s of ['Sag GUTEN, TAG!','Das ist RICHTIG!','Đáp án là B.','Bạn nên chọn (B)','Antwort B','Lösung B']) assert.equal(containsAnswer(s,answers),true,s);
  for (const s of ['Unrichtig ist es.','Chọn B1','Chọn AB','B là một chữ cái']) assert.equal(containsAnswer(s,answers),false,s);
});
test('answers already present in the prompt are excluded on word boundaries', () => {
  const answers=answerFragments({prompt:'Um 13 Uhr? Der Wert ist 130.',key:{accepted:['13','30']},solution:'13'});
  assert.deepEqual(answers.texts,['30']);
  assert.equal(containsAnswer('Um 13 Uhr?',answers),false);
  assert.equal(containsAnswer('Đó là 30.',answers),true);
  const labels=answerFragments({prompt:'Phương án B được viết như thế nào?',key:{correct:['b']},choices:[{id:'a',text:'một'},{id:'b',text:'hai'}]});
  assert.deepEqual(labels.labels,[]);
});
test('sentences are held across chunks and split answers never reach output', () => {
  const output=[]; const filter=new SentenceFilter(fragments('Guten Tag'),(text,blocked)=>output.push({text,blocked}));
  filter.push('Erste Frage. Die Antwort ist gu'); assert.deepEqual(output,[{text:'Erste Frage.',blocked:false}]);
  filter.push('TEN, tag! Noch eine'); filter.finish();
  assert.deepEqual(output,[{text:'Erste Frage.',blocked:false},{text:' '+BLOCKED_SENTENCE,blocked:true},{text:' Noch eine',blocked:false}]);
});
test('newline flushes a sentence and long unpunctuated text is checked as a whole', () => {
  const output=[]; const filter=new SentenceFilter(fragments('secret'),(text,blocked)=>output.push({text,blocked}));
  filter.push('Safe\n'); assert.deepEqual(output,[{text:'Safe\n',blocked:false}]);
  filter.push('x'.repeat(230)+' se'); assert.equal(output.length,1);
  filter.push('cret '+'y'.repeat(30)); filter.finish();
  assert.ok(output.some(x=>x.blocked)); assert.doesNotMatch(output.map(x=>x.text).join(''),/secret/i);
  const plain=[]; const long=new SentenceFilter(fragments('zebra'),text=>plain.push(text));
  long.push('a'.repeat(241)); assert.equal(plain.length,0); long.finish(); assert.equal(plain.join(''),'a'.repeat(241));
});
test('visible question and choices can be quoted without asserting the answer',()=>{
  const spec=answerFragments({prompt:'Câu 2: chọn từ nào?',choices:[{id:'a',text:'gehen'},{id:'b',text:'läuft'}],key:{correct:['b']},solution:'läuft'});
  for(const text of ['Câu 2 hỏi chọn từ nào?','Phương án A là gehen và phương án B là läuft.','Từ läuft xuất hiện trong đề.']) assert.equal(containsAnswer(text,spec),false,text);
  for(const text of ['Đáp án là B.','Chọn läuft.']) assert.equal(containsAnswer(text,spec),true,text);
});
test('quoting a visible prompt does not trigger labels belonging to other items',()=>{
  const spec={texts:[],labels:['B'],visible:['chọn phương án b hoặc c']};
  assert.equal(containsAnswer('Chọn phương án B hoặc C.',spec),false);
  assert.equal(containsAnswer('Đáp án là B.',spec),true);
});
test('adjacent blocked sentences produce one replacement across chunks',()=>{
  const output=[]; const filter=new SentenceFilter(fragments('secret','hidden'),(text,blocked)=>output.push({text,blocked}));
  filter.push('secret. hid');filter.push('den! Câu này cần suy nghĩ.');filter.finish();
  assert.equal(output.filter(x=>x.blocked).length,1);assert.equal(output.map(x=>x.text).join(''),BLOCKED_SENTENCE+' Câu này cần suy nghĩ.');
});
test('long sentences cannot reveal a label and its reference on opposite sides of the cap', () => {
  const spec={texts:[],labels:['B']};
  for(const sentence of ['Chọn '+'x'.repeat(245)+' B.', 'B '+'x'.repeat(245)+' là đáp án.']) {
    const output=[]; const filter=new SentenceFilter(spec,(text,blocked)=>output.push({text,blocked}));
    filter.push(sentence); filter.finish();
    assert.ok(output.some(x=>x.blocked)); assert.doesNotMatch(output.map(x=>x.text).join(''),/(?:^|\s)B(?:\s|\.)/);
  }
});
