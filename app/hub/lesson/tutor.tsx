"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { renderEmphasis } from '../inline-emphasis';
import type { TutorTurn } from '../../../lib/contracts/tutor';
import { TutorPet, type TutorPetState } from './tutor-pet';
import './tutor.css';

const blockedText = '(Chỗ này lộ đáp án mất, con giữ lại nha.)';
const busyText = 'Con đang bận một chút. Câu trả lời sẽ có trong bài nha.';
type Message = { id:string; question:string; answer:string; status:string };
type Data = { turns:TutorTurn[]; enabled:boolean; remaining:number; limit:'lesson'|'day'; displayName:string };
const initialRequests = new Map<string, Promise<Data>>();
function readTutor(lessonId:string, fresh:boolean) {
  if (!fresh && initialRequests.has(lessonId)) return initialRequests.get(lessonId)!;
  const request=fetch(`/api/lessons/${lessonId}/tutor`,{cache:'no-store'}).then(async response=>{
    if (!response.ok) throw new Error('offline');
    return await response.json() as Data;
  });
  if (!fresh) { initialRequests.set(lessonId,request); void request.finally(()=>initialRequests.delete(lessonId)).catch(()=>{}); }
  return request;
}

export default function Tutor({lessonId,items,number,child,correctCheck,checkedItem}:{lessonId:string;items:string[];number:number;child:boolean;correctCheck?:string;checkedItem?:string}) {
  const [choice,setChoice]=useState({page:number, value:number}), [displayName,setDisplayName]=useState('');
  const selected=choice.page===number ? choice.value : number;
  const itemId=items[selected-1] ?? items[0];
  const [enabled,setEnabled]=useState(false), [open,setOpen]=useState(false), [remaining,setRemaining]=useState(20);
  const [limit,setLimit]=useState<'lesson'|'day'>('lesson');
  const [messages,setMessages]=useState<Message[]>([]), [question,setQuestion]=useState(''), [state,setState]=useState<TutorPetState>('idle');
  const [sending,setSending]=useState(false), [offline,setOffline]=useState(false), [notice,setNotice]=useState('');
  const trigger=useRef<HTMLButtonElement>(null), input=useRef<HTMLTextAreaElement>(null);
  const seenCheck=useRef(correctCheck), asked=useRef(new Set<string>());
  const [reaction,setReaction]=useState<TutorPetState | null>(null);
  const load=useCallback(async (fresh=false) => {
    const data=await readTutor(lessonId,fresh);
    setEnabled(data.enabled); setRemaining(data.remaining); setLimit(data.limit); setDisplayName(data.displayName ?? '');
    asked.current=new Set(data.turns.map(turn=>turn.item_id));
    setMessages(previous => {
      const saved=data.turns.map(t=> {
        const partial=previous.find(m=>m.id===t.id || (m.question===t.question && m.status==='streaming'));
        return {id:t.id,question:t.question,answer:t.answer ?? partial?.answer ?? '',status:t.status};
      });
      return [...saved,...previous.filter(m=>m.status==='streaming' && !saved.some(t=>t.question===m.question))];
    });
    return data;
  },[lessonId]);
  useEffect(()=>{
    // Loading permission and history is synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(()=>{});
  },[load]);
  useEffect(()=>{
    if (!open) return;
    input.current?.focus();
    const escape=(event:KeyboardEvent) => { if(event.key==='Escape') { event.preventDefault(); setOpen(false); setState('idle'); requestAnimationFrame(()=>trigger.current?.focus()); } };
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[open]);
  useEffect(()=>{
    if (state !== 'greet' && state !== 'point') return;
    const timer=setTimeout(()=>setState(current=>current === 'greet' ? 'point' : current === 'point' ? 'listen' : current), state === 'greet' ? 480 : 720);
    return ()=>clearTimeout(timer);
  },[state]);
  useEffect(()=>{
    if (!correctCheck || correctCheck===seenCheck.current) return;
    seenCheck.current=correctCheck;
    setReaction(checkedItem && asked.current.has(checkedItem) ? 'nod' : 'cheer');
    const timer=setTimeout(()=>setReaction(null),720);
    return ()=>clearTimeout(timer);
  },[correctCheck,checkedItem]);
  function close() { setOpen(false); setState('idle'); requestAnimationFrame(()=>trigger.current?.focus()); }
  async function ask() {
    const text=question.trim(); if(!text || sending || remaining<=0) return;
    const id=String(Date.now()); setQuestion(''); setSending(true); setOffline(false); setNotice(''); setState('think');
    setMessages(previous=>[...previous,{id,question:text,answer:'',status:'streaming'}]);
    try {
      const response=await fetch('/api/tutor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lessonId,itemId,question:text})}).catch(()=>{throw new Error('offline');});
      if(!response.ok || !response.body) { const body=await response.json().catch(()=>({})) as {error?:string}; throw new Error(body.error || 'Chưa gửi được câu hỏi.'); }
      setRemaining(n=>Math.max(0,n-1));
      asked.current.add(itemId);
      const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='', finished=false;
      while(true) {
        const {done,value}=await reader.read(); buffer+=decoder.decode(value,{stream:!done}).replace(/\r\n/g,'\n');
        let boundary:number;
        while((boundary=buffer.indexOf('\n\n'))>=0) {
          const record=buffer.slice(0,boundary); buffer=buffer.slice(boundary+2);
          const event=record.match(/^event: (.+)$/m)?.[1]; const raw=record.match(/^data: (.+)$/m)?.[1]; if(!raw) continue;
          const data=JSON.parse(raw) as {text?:string;message?:string;blocked?:boolean};
          if(event==='blocked') setState('blocked');
          if(event==='delta' && data.text) { const part=data.text; setMessages(prev=>prev.map(m=>m.id===id?{...m,answer:m.answer+part}:m)); if(!data.blocked) setState('talk'); }
          if(event==='queued') { finished=true; setState('busy'); setMessages(prev=>prev.map(m=>m.id===id?{...m,status:'queued'}:m)); }
          if(event==='done') { finished=true; setMessages(prev=>prev.map(m=>m.id===id?{...m,status:'answered'}:m)); }
          if(event==='error') { finished=true; setNotice(data.message || 'Chưa nhận được câu trả lời.'); }
        }
        if(done) break;
      }
      if(!finished) throw new Error('offline');

    } catch(error) {
      if(error instanceof Error && error.message !== 'offline' && error.message !== 'Failed to fetch' && error.message !== 'Load failed') setNotice(error.message);
      else { setOffline(true); setState('offline'); }
    } finally { setSending(false); }
  }
  if(!enabled) return null;
  return <div className="tutor-whole">
    <button hidden={open} ref={trigger} type="button" aria-label="Hỏi Bột" aria-expanded={false} onClick={()=>{setChoice({page:number,value:number});setOpen(true);setState('greet');void load(true).catch(()=>{setOffline(true);setState('offline');});}} className="tutor-trigger">
      <span>Hỏi Bột nè!</span><TutorPet size="corner" state={reaction ?? 'idle'} />
    </button>
    {open && <section role="dialog" aria-label="Trò chuyện với Bột" className={'tutor-sheet '+(child?'tutor-sheet-child':'')}>
      <div className="tutor-chips"><div role="group" aria-label="Hỏi về câu nào">{items.map((id,index)=><button key={id} type="button" aria-pressed={selected===index+1} onClick={()=>setChoice({page:number,value:index+1})}>Câu {index+1}{number===index+1?' · đang mở':''}</button>)}</div><button type="button" aria-label="Đóng, Bột về chỗ ngồi" onClick={close}>×</button></div>
      <div className="tutor-messages" aria-live="polite">
        {!messages.length && <div className="tutor-bot"><TutorPet size="panel" state={state}/><p>Con chào{displayName ? ` ${displayName}` : ''} ạ! Bài này có {items.length} câu, đang ở câu {number} nè. Chỗ nào chưa hiểu cứ hỏi con nha, con chỉ gợi ý thôi chứ không nói đáp án đâu.</p></div>}
        {messages.map((m,index)=><div key={m.id} className="tutor-message"><p className="tutor-question">{m.question}</p>{(m.answer || m.status==='queued' || (sending && m.status==='streaming')) && <div className="tutor-bot">{index===messages.length-1 && <TutorPet size="panel" state={remaining===0?'limit':state}/>}<p>{m.answer ? m.answer.split(blockedText).map((part,i)=><span key={i}>{i>0 && <strong>{blockedText}</strong>}{renderEmphasis(part)}</span>) : m.status==='queued' ? busyText : 'Để con nghĩ xíu nha…'}</p></div>}</div>)}
        {offline && <p role="status">Mất kết nối. Phần đã nghe vẫn được giữ. <button type="button" onClick={()=>{setOffline(false);setState('listen');input.current?.focus();}}>Hỏi tiếp</button></p>}
        {notice && <p role="alert">{notice}</p>}
        {remaining===0 && <p>{limit==='day' ? 'Hôm nay con đã trả lời đủ 60 lượt. Mai hỏi con tiếp nha!' : 'Bài này con trả lời đủ 20 lượt rồi, con đi ngủ xíu đây.'}</p>}
      </div>
      {remaining>0 && <div className="tutor-compose"><label htmlFor="tutor-question" className="sr-only">Câu hỏi cho Bột</label><textarea ref={input} id="tutor-question" value={question} onFocus={()=>setState('listen')} onChange={e=>{setState('listen');setQuestion(e.target.value);}} maxLength={500} rows={2}/><button type="button" disabled={sending || !question.trim()} onClick={()=>void ask()} className="brick min-h-11 px-4 disabled:opacity-60">{sending?'Chờ chút':'Gửi'}</button><small>Còn {remaining} lượt hỏi trong bài này</small></div>}
    </section>}
  </div>;
}
