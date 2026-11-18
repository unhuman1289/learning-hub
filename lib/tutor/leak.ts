import { normalizeText } from '../evidence/normalize-text.ts';

export const BLOCKED_SENTENCE = '(Chỗ này lộ đáp án mất, con giữ lại nha.)';
const normalized = (s: string) => normalizeText(s, { ignoreCase: true, punctuation: 'ignore' }).replace(/\s+/g, ' ').trim();
function containsToken(text: string, answer: string): boolean {
  if (!answer) return false;
  let at=text.indexOf(answer);
  while(at>=0) {
    const before=text[at-1], after=text[at+answer.length];
    if ((!before || !/[\p{L}\p{M}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{M}\p{N}]/u.test(after))) return true;
    at=text.indexOf(answer,at+1);
  }
  return false;
}
export type AnswerFragments = {texts:string[];labels:string[];choices?:string[];visible?:string[]};
/** Visible options may be quoted, but not identified as correct. Keys never leave the Worker. */
export function answerFragments(item:Record<string,unknown>):AnswerFragments {
  const key=item.key as {accepted?:string[];correct?:string[]}|undefined;
  const choices=(item.choices as {id:string;text:string}[]|undefined) ?? [];
  const correct=choices.map((choice,index)=>({choice,index})).filter(({choice})=>key?.correct?.includes(choice.id));
  const prompt=typeof item.prompt==='string'?item.prompt:'';
  const visible=[prompt,...choices.map(choice=>choice.text)].map(normalized).filter(Boolean);
  const texts=[typeof item.solution==='string'?item.solution:'',...(key?.accepted ?? [])]
    .filter(text=>normalized(text) && !visible.some(shown=>containsToken(shown,normalized(text))));
  return {texts,labels:correct.map(({index})=>String.fromCharCode(65+index)).filter(label=>!containsToken(normalized(prompt),normalized(label))),choices:correct.map(({choice})=>choice.text),visible};
}
const positive = /(?:đáp án|phương án đúng|lựa chọn đúng|chọn|là đúng|đúng là|correct(?: answer)?|choose|antwort|lösung)/iu;
export function containsAnswer(sentence:string, fragments:AnswerFragments):boolean {
  const text=normalized(sentence);
  if (text && (fragments.visible ?? []).some(visible=>containsToken(visible,text))) return false;
  if (fragments.texts.some(fragment=>containsToken(text,normalized(fragment)))) return true;
  if (!positive.test(sentence)) return false;
  const labels=sentence.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ');
  return fragments.labels.some(label=>containsToken(labels,normalized(label))) || (fragments.choices ?? []).some(choice=>containsToken(text,normalized(choice)));
}
/** A response is already limited to 2,000 characters; buffer an entire sentence to avoid false positives at chunk boundaries. */
export class SentenceFilter {
  private pending='';
  private lastBlocked=false;
  private fragments:AnswerFragments;
  private output:(text:string,blocked:boolean)=>void;
  constructor(fragments:AnswerFragments,output:(text:string,blocked:boolean)=>void) { this.fragments=fragments; this.output=output; }
  push(chunk:string) {
    this.pending+=chunk;
    const boundary=/[.!?。！？]+(?=\s)|\n/u;
    let match:RegExpExecArray|null;
    while((match=boundary.exec(this.pending))) {
      const end=match.index+match[0].length;
      this.send(this.pending.slice(0,end)); this.pending=this.pending.slice(end);
    }
  }
  finish() { if(this.pending) this.send(this.pending); this.pending=''; }
  private send(sentence:string) {
    const blocked=containsAnswer(sentence,this.fragments);
    if(blocked) {
      if(!this.lastBlocked) this.output((sentence.match(/^\s*/u)?.[0] ?? '')+BLOCKED_SENTENCE,true);
      this.lastBlocked=true;
    } else {
      this.output(sentence,false);
      if(sentence.trim()) this.lastBlocked=false;
    }
  }
}
