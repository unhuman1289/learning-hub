import { aiSubjects } from '../ai-controls.ts';
import { tutorAnswer } from '../contracts/tutor.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { tutorContext } from './context.ts';

export const TUTOR_BUSY = 'Gia sư đang bận, câu trả lời sẽ có trong bài';
type Bindings = { ENVIRONMENT?:string; APP_ENV?:string; OPENAI_ENABLED?:string; OPENAI_SUBJECT_IDS?:string; OPENAI_TTS_SUBJECT_IDS?:string; OPENAI_API_KEY?:string; AI_QUEUE?:{send(body:unknown):Promise<unknown>} };
type Emit = (event:string, data:object) => void;
type Fetcher = typeof fetch;

/** Permission is checked at creation and again immediately before every model call. */
export async function tutorEligible(db:EvidenceDb, id:string, env:Bindings) {
  const row = await db.prepare(`SELECT l.subject_id,coalesce(s.role,'adult') AS role,l.completed_at,coalesce(s.tutor_enabled,1) AS enabled,i.flag
    FROM tutor_turns t JOIN learning_lessons l ON l.id=t.lesson_id AND l.user_id=t.learner_id
    JOIN lesson_items i ON i.lesson_id=t.lesson_id AND i.item_id=t.item_id AND i.learner_id=t.learner_id
    LEFT JOIN learner_settings s ON s.user_id=t.learner_id WHERE t.id=?`).bind(id)
    .first<{subject_id:string;role:string;completed_at:string|null;enabled:number;flag:string|null}>();
  if (!row || row.completed_at || !row.enabled || row.flag === 'item_void') return false;
  return row.role === 'adult' && (await aiSubjects(db, env)).includes(row.subject_id);
}

export async function dispatchTutor(env:Bindings, id:string) {
  if (env.AI_QUEUE) await env.AI_QUEUE.send({tutorTurnId:id});
}

/** A single atomic claim fences duplicate Queue deliveries and late responses. */
async function claim(db:EvidenceDb, id:string, token:string, now:Date) {
  const lease = new Date(now.getTime()+90000).toISOString();
  const result = await db.prepare(`UPDATE tutor_turns SET status='streaming',attempt_token=?,lease_expires_at=?
    WHERE id=? AND (status='queued' OR (status='streaming' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?))`)
    .bind(token,lease,id,now.toISOString()).run();
  return !!result.meta.changes;
}

/** Read SSE as records, including events split across arbitrary UTF-8 chunks. */
async function* records(body:ReadableStream<Uint8Array>) {
  const reader=body.getReader(), decoder=new TextDecoder(); let buffer='';
  try {
    while (true) {
      const {value,done}=await reader.read();
      buffer += decoder.decode(value, {stream:!done}).replace(/\r\n/g,'\n');
      let cut:number;
      while ((cut=buffer.indexOf('\n\n'))>=0) {
        const record=buffer.slice(0,cut); buffer=buffer.slice(cut+2);
        const data=record.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if (data && data!=='[DONE]') yield JSON.parse(data) as Record<string,unknown>;
      }
      if (done) break;
      if (buffer.length>131072) throw new Error('SSE record too large');
    }
  } finally { await reader.cancel().catch(()=>{}); }
}

export async function answerTutor(db:EvidenceDb, env:Bindings, id:string, prompt:string, emit:Emit, fetcher:Fetcher=fetch, timeoutMs=10000, startedAt=Date.now()) {
  if (!await tutorEligible(db,id,env)) return 'ineligible' as const;
  // Context is built while queued; it excludes keys and other questions.
  await db.prepare("UPDATE tutor_turns SET status='queued',attempt_token=NULL,lease_expires_at=NULL WHERE id=? AND status='streaming' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?").bind(id,new Date().toISOString()).run();
  const data=await tutorContext(db,id);
  if (!data) {
    const current=await db.prepare('SELECT status FROM tutor_turns WHERE id=?').bind(id).first<{status:string}>();
    if (current?.status==='streaming') { emit('turn',{id,status:'streaming',message:TUTOR_BUSY}); return 'claimed' as const; }
    return 'ineligible' as const;
  }
  const token=crypto.randomUUID(), started=startedAt;
  if (!await claim(db,id,token,new Date())) return 'claimed' as const;
  emit('turn',{id,status:'streaming'});
  const abort=new AbortController();
  let firstMs:number|undefined, answer='', inputTokens:number|undefined, outputTokens:number|undefined, completed=false;
  let timer=setTimeout(()=>abort.abort(),Math.max(0,timeoutMs-(Date.now()-started)));
  try {
    if (!await tutorEligible(db,id,env)) throw new Error('Ineligible');
    if (!env.OPENAI_API_KEY || Date.now()-started>=timeoutMs) throw new Error('Unavailable');
    const counted=await db.prepare("UPDATE tutor_turns SET openai_calls=openai_calls+1 WHERE id=? AND status='streaming' AND attempt_token=? AND openai_calls<2 AND EXISTS(SELECT 1 FROM learning_lessons l JOIN ai_subject_controls c ON c.subject_id=l.subject_id WHERE l.id=tutor_turns.lesson_id AND c.openai_enabled=1)").bind(id,token).run();
    if (!counted.meta.changes) throw new Error('Call limit');
    const response=await fetcher('https://api.openai.com/v1/responses', {method:'POST',
      headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-6-luna',instructions:prompt,input:JSON.stringify(data.context),stream:true,store:false,
        reasoning:{effort:'none'},max_output_tokens:800}), signal:abort.signal,redirect:'manual'});
    if (!response.ok || !response.body) throw new Error('Unavailable');
    for await (const entry of records(response.body)) {
      if (entry.type==='response.output_text.delta' && typeof entry.delta==='string' && entry.delta) {
        if (firstMs===undefined) { firstMs=Date.now()-started; clearTimeout(timer); timer=setTimeout(()=>abort.abort(),60000); }
        answer+=entry.delta;
        if ([...answer].length>2000 || answer.includes('\0')) throw new Error('Response too long');
        emit('delta',{text:entry.delta});
      }
      if (entry.type==='response.completed') {
        const response=entry.response as {status?:string;usage?:{input_tokens?:number;output_tokens?:number}}|undefined;
        inputTokens=response?.usage?.input_tokens; outputTokens=response?.usage?.output_tokens;
        completed=response?.status==='completed' && Number.isSafeInteger(inputTokens) && Number.isSafeInteger(outputTokens) && inputTokens!>=0 && outputTokens!>=0;
      }
      if (entry.type==='response.failed' || entry.type==='error' || entry.type==='response.incomplete' || entry.type==='response.refusal.delta') throw new Error('Incomplete response');
    }
    const parsed=tutorAnswer.safeParse(answer);
    if (!completed || !parsed.success || firstMs===undefined) throw new Error('Incomplete response');
    const saved=await db.prepare(`UPDATE tutor_turns SET status='answered',answer=?,first_token_ms=?,input_tokens=?,output_tokens=?,answered_at=?,attempt_token=NULL,lease_expires_at=NULL
      WHERE id=? AND status='streaming' AND attempt_token=? AND EXISTS(SELECT 1 FROM learning_lessons l LEFT JOIN learner_settings s ON s.user_id=l.user_id
        JOIN lesson_items i ON i.lesson_id=l.id AND i.item_id=tutor_turns.item_id WHERE l.id=tutor_turns.lesson_id AND l.completed_at IS NULL AND coalesce(s.tutor_enabled,1)=1 AND i.flag IS NOT 'item_void'
        AND coalesce(s.role,'adult')='adult' AND EXISTS(SELECT 1 FROM ai_subject_controls c WHERE c.subject_id=l.subject_id AND c.openai_enabled=1) AND ?=1)`)
      .bind(parsed.data,firstMs,inputTokens,outputTokens,new Date().toISOString(),id,token,Number(env.OPENAI_ENABLED==='true')).run();
    if (!saved.meta.changes) {
      await db.prepare("UPDATE tutor_turns SET status='blocked',attempt_token=NULL,lease_expires_at=NULL WHERE id=? AND status='streaming' AND attempt_token=?").bind(id,token).run();
      emit('error',{message:'Câu hỏi không còn trong bài đang làm.'}); return 'ineligible' as const;
    }
    emit('done',{id,status:'answered'}); return 'answered' as const;
  } catch {
    abort.abort();
    const saved=await db.prepare("UPDATE tutor_turns SET status=CASE WHEN openai_calls>=2 THEN 'failed' ELSE 'queued' END,attempt_token=NULL,lease_expires_at=NULL WHERE id=? AND status='streaming' AND attempt_token=? RETURNING status").bind(id,token).first<{status:string}>();
    if (saved?.status==='failed') { emit('error',{id,status:'failed',message:'Đã thử 2 lần nhưng chưa nhận được câu trả lời.'}); return 'failed' as const; }
    if (saved) { emit('queued',{id,status:'queued',message:TUTOR_BUSY}); return 'queued' as const; }
    return 'claimed' as const;
  } finally { clearTimeout(timer); }
}
