"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TutorTurn } from '../../../lib/contracts/tutor';
import { TutorPet, type TutorPetState } from './tutor-pet';

const blockedText = '(Chỗ này có đáp án, mình giữ lại nhé.)';
const busyText = 'Mình đang bận một chút. Câu trả lời sẽ có trong bài, bạn cứ làm câu khác rồi quay lại đọc nhé.';
type Message = { id:string; question:string; answer:string; status:string };
type Data = { turns:TutorTurn[]; enabled:boolean; remaining:number; limit:'lesson'|'day' };
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

export default function Tutor({lessonId,itemId,number,child,correctCheck}:{lessonId:string;itemId:string;number:number;child:boolean;correctCheck?:string}) {
  const [enabled,setEnabled]=useState(false), [open,setOpen]=useState(false), [remaining,setRemaining]=useState(20);
  const [limit,setLimit]=useState<'lesson'|'day'>('lesson');
  const [messages,setMessages]=useState<Message[]>([]), [question,setQuestion]=useState(''), [state,setState]=useState<TutorPetState>('idle');
  const [sending,setSending]=useState(false), [offline,setOffline]=useState(false), [notice,setNotice]=useState('');
  const trigger=useRef<HTMLButtonElement>(null), input=useRef<HTMLTextAreaElement>(null);
  const asked=useRef(false), seenCheck=useRef(correctCheck);
  const [reaction,setReaction]=useState<TutorPetState | null>(null);
  const load=useCallback(async (fresh=false) => {
    const data=await readTutor(lessonId,fresh);
    setEnabled(data.enabled); setRemaining(data.remaining); setLimit(data.limit);
    asked.current=data.turns.some(turn=>turn.item_id===itemId);
    setMessages(previous => {
      const saved=data.turns.filter(t=>t.item_id===itemId).map(t=> {
        const partial=previous.find(m=>m.id===t.id || (m.question===t.question && m.status==='streaming'));
        return {id:t.id,question:t.question,answer:t.answer ?? partial?.answer ?? '',status:t.status};
      });
      return [...saved,...previous.filter(m=>m.status==='streaming' && !saved.some(t=>t.question===m.question))];
    });
    return data;
  },[lessonId,itemId]);
  useEffect(()=>{
    // Loading permission and history is synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(()=>{});
  },[load]);
  useEffect(()=>{
    if (!open) return;
    input.current?.focus();
    const escape=(event:KeyboardEvent) => { if(event.key==='Escape') { event.preventDefault(); setOpen(false); setState('idle'); trigger.current?.focus(); } };
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[open]);
  useEffect(()=>{
    if (state !== 'greet' && state !== 'point') return;
    const timer=setTimeout(()=>setState(current=>current === 'greet' ? 'point' : current === 'point' ? 'listen' : current), state === 'greet' ? 480 : 720);
    return ()=>clearTimeout(timer);
  },[state]);
  useEffect(()=>{
    if (!correctCheck || correctCheck === seenCheck.current) return;
    seenCheck.current=correctCheck;
    // The choice uses the tutor history already loaded for this item.
    setReaction(asked.current ? 'nod' : 'cheer');
    const timer=setTimeout(()=>setReaction(null),720);
    return ()=>clearTimeout(timer);
  },[correctCheck]);
  function close() { setOpen(false); setState('idle'); trigger.current?.focus(); }
  async function ask() {
    const text=question.trim(); if(!text || sending || remaining<=0) return;
    const id=String(Date.now()); setQuestion(''); setSending(true); setOffline(false); setNotice(''); setState('think');
    setMessages(previous=>[...previous,{id,question:text,answer:'',status:'streaming'}]);
    try {
      const response=await fetch('/api/tutor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lessonId,itemId,question:text})}).catch(()=>{throw new Error('offline');});
      if(!response.ok || !response.body) { const body=await response.json().catch(()=>({})) as {error?:string}; throw new Error(body.error || 'Chưa gửi được câu hỏi.'); }
      setRemaining(n=>Math.max(0,n-1));
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
      void readTutor(lessonId,true).then(data=>{asked.current=data.turns.some(turn=>turn.item_id===itemId);}).catch(()=>{});
    } catch(error) {
      if(error instanceof Error && error.message !== 'offline' && error.message !== 'Failed to fetch' && error.message !== 'Load failed') setNotice(error.message);
      else { setOffline(true); setState('offline'); }
    } finally { setSending(false); }
  }
  if(!enabled) return null;
  return <div className="mt-4 flex flex-col items-end gap-2">
    <link rel="preload" as="image" href="/api/tutor/sprite/idle.webp" />
    <link rel="preload" as="image" href="/api/tutor/sprite/sit.webp" />
    <button ref={trigger} type="button" aria-label="Hỏi gia sư về câu này" aria-expanded={open} onClick={()=>{setOpen(true);setState('greet');void load(true).catch(()=>{setOffline(true);setState('offline');});}}
      className="flex min-h-11 items-center gap-2 rounded-xl bg-[#fff8e9] p-2 text-[#38281e] shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#773729]">
      <TutorPet state={reaction ?? (open?(remaining === 0 ? 'limit' : state):'idle')}/><span>Hỏi mình nhé!</span>
    </button>
    {open && <section aria-label="Trò chuyện với gia sư" className={'w-full max-w-xl overflow-y-auto rounded-t-2xl border border-[#a78b72] bg-[#fff9ed] p-4 text-[#38281e] shadow-lg max-h-[55dvh] motion-safe:animate-[tutor-enter_200ms_ease-out] '+(child?'text-lg leading-9':'leading-7')}>
      <header className="flex items-start gap-3"><TutorPet state={reaction ?? (remaining === 0 ? 'limit' : state)}/><div className="flex-1"><strong>Gia sư nhỏ</strong><p className="text-sm leading-5">{child?'Chỉ hỏi về câu này. Bố mẹ đọc được mọi câu hỏi và trả lời.':'Gợi hướng cho câu này, không nói đáp án.'}</p></div><button type="button" onClick={close} className="min-h-11 min-w-11 underline">Đóng</button></header>
      <div className="mt-3 grid gap-3" aria-live="polite">
        <p className="mr-8 rounded-xl bg-white p-3">Chào bạn! Câu {number} có chỗ nào chưa rõ? Mình gợi hướng thôi, không nói đáp án đâu nhé.</p>
        {messages.map(m=><div key={m.id} className="grid gap-2"><p className="ml-8 rounded-xl bg-[#ffe79a] p-3">{m.question}</p>
          {m.answer && <p className="mr-8 whitespace-pre-wrap rounded-xl bg-white p-3">{m.answer.split(blockedText).map((part,i)=><span key={i}>{i>0 && <span className="font-semibold text-[#a12620]">{blockedText}</span>}{part}</span>)}</p>}
          {m.status==='queued' && <p className="mr-8 rounded-xl bg-white p-3">{busyText}</p>}
          {sending && m.status==='streaming' && !m.answer && <p className="mr-8 rounded-xl bg-white p-3">Để mình nghĩ chút…</p>}
        </div>)}
        {offline && <p role="status">Mất kết nối. Phần đã nghe vẫn được giữ. <button type="button" className="underline" onClick={()=>{setOffline(false);setState('listen');input.current?.focus();}}>Hỏi tiếp</button></p>}
        {notice && <p role="alert">{notice}</p>}
        {remaining===0 && <p>{limit==='day' ? 'Hôm nay mình đã trả lời đủ 60 lượt. Mai hỏi tiếp nhé!' : 'Bài này mình đã trả lời đủ 20 lượt rồi. Bạn thử tự làm tiếp nhé!'}</p>}
      </div>
      {remaining>0 && <><div className="mt-3 flex flex-wrap gap-2">{['Mình nên bắt đầu từ đâu?','Bạn gợi ý thêm nhé?','Mình cần chú ý điều gì?'].map(s=><button type="button" key={s} className="min-h-11 rounded border border-[#765342] px-2 text-sm" onClick={()=>{setQuestion(s);input.current?.focus();}}>{s}</button>)}</div>
        <label htmlFor={'tutor-'+itemId} className="mt-3 block">Câu hỏi của bạn</label><textarea ref={input} id={'tutor-'+itemId} value={question} onFocus={()=>setState(current=>current === 'greet' || current === 'point' ? current : 'listen')} onChange={e=>{setState('listen');setQuestion(e.target.value);}} maxLength={500} rows={2} className="w-full rounded border border-[#765342] bg-white p-2 text-[#38281e] focus-visible:outline-2 focus-visible:outline-[#773729]" />
        <button type="button" disabled={sending || !question.trim()} onClick={()=>void ask()} className="brick min-h-11 px-4 disabled:opacity-60">{sending?'Chờ chút':'Gửi'}</button><p className="text-sm">Còn {remaining} lượt hỏi trong bài này</p></>}
    </section>}
  </div>;
}
