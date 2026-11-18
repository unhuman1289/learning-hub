import { tutorAnswer } from '../contracts/tutor.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { SentenceFilter } from './leak.ts';
import { tutorContext } from './context.ts';

export const TUTOR_BUSY = 'Gia sư đang bận, câu trả lời sẽ có trong bài';
type Bindings = { ENVIRONMENT?:string; APP_ENV?:string; OPENAI_ENABLED?:string; OPENAI_SUBJECT_IDS?:string; OPENAI_TTS_SUBJECT_IDS?:string; OPENAI_API_KEY?:string; AI_QUEUE?:{send(body:unknown):Promise<unknown>} };
type Emit = (event:string, data:object) => void;
type Fetcher = typeof fetch;

/** Permission is checked at creation and again immediately before every model call. */
export async function tutorEligible(db:EvidenceDb, id:string, env:Bindings) {
  if (env.OPENAI_ENABLED !== 'true') return false;
  const row = await db.prepare(`SELECT l.subject_id,coalesce(s.role,'adult') AS role,l.completed_at,coalesce(s.tutor_enabled,1) AS enabled,i.flag,coalesce(c.openai_enabled,1) AS openai_enabled
    FROM tutor_turns t JOIN learning_lessons l ON l.id=t.lesson_id AND l.user_id=t.learner_id
    JOIN lesson_items i ON i.lesson_id=t.lesson_id AND i.item_id=t.item_id AND i.learner_id=t.learner_id
    JOIN subjects sub ON sub.id=l.subject_id
    LEFT JOIN learner_settings s ON s.user_id=t.learner_id
    LEFT JOIN ai_subject_controls c ON c.subject_id=sub.id WHERE t.id=?`).bind(id)
    .first<{subject_id:string;role:string;completed_at:string|null;enabled:number;flag:string|null;openai_enabled:number}>();
  if (!row || row.completed_at || !row.enabled || row.flag === 'item_void') return false;
  // Children are included (owner decision 17/11/2026); they are sent by nickname only and guardians read every turn.
  return row.openai_enabled === 1;
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

export async function answerTutor(db:EvidenceDb, env:Bindings, id:string, prompt:string, emit:Emit, fetcher:Fetcher=fetch, timeoutMs=10000, startedAt=Date.now(), preTiming?: {body_ms:number;access_ms:number;notebook_ms:number;open_turn_ms:number}) {
  const timing = {pre_answer_ms:Math.max(0,Date.now()-startedAt), eligibility_ms:0, recovery_ms:0, context_ms:0, claim_ms:0, recheck_ms:0, count_ms:0, openai_first_ms:0};
  let phase=Date.now();
  const eligible = await tutorEligible(db,id,env);
  timing.eligibility_ms=Date.now()-phase;
  if (!eligible) return 'ineligible' as const;
  // Context is built while queued; it excludes keys and other questions.
  phase=Date.now();
  await db.prepare("UPDATE tutor_turns SET status='queued',attempt_token=NULL,lease_expires_at=NULL WHERE id=? AND status='streaming' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?").bind(id,new Date().toISOString()).run();
  timing.recovery_ms=Date.now()-phase;
  phase=Date.now();
  const data=await tutorContext(db,id);
  timing.context_ms=Date.now()-phase;
  if (!data) {
    const current=await db.prepare('SELECT status FROM tutor_turns WHERE id=?').bind(id).first<{status:string}>();
    if (current?.status==='streaming') { emit('turn',{id,status:'streaming',message:TUTOR_BUSY}); return 'claimed' as const; }
    return 'ineligible' as const;
  }
  const token=crypto.randomUUID(), started=startedAt;
  phase=Date.now();
  const claimed=await claim(db,id,token,new Date());
  timing.claim_ms=Date.now()-phase;
  if (!claimed) return 'claimed' as const;
  emit('turn',{id,status:'streaming'});
  const abort=new AbortController();
  let firstMs:number|undefined, answer='', rawLength=0, leakBlocked=false, inputTokens:number|undefined, outputTokens:number|undefined, cachedTokens:number|undefined, completed=false;
  let classification = '', offTopic: boolean | undefined;
  const question=data.context.question.toLocaleLowerCase('vi');
  const nameQuestion=/(?:tôi|mình|tên)\s+(?:là\s+ai|tên\s+gì|gì)|tên\s+(?:tôi|mình)\s+(?:là\s+)?gì/u.test(question);
  const itemQuestion=/\bcâu\s*(?:\d+|này|đó|kia)\b/iu.test(question);
  const answerQuestion=/(?:đáp án|lời giải|điền gì|cách làm)/iu.test(question);
  let substitute: string | undefined;
  let namePending = '';
  const personalize = (text:string, final=false) => {
    namePending = (namePending + text).replaceAll('{ten}', data.displayName);
    let cut = namePending.length;
    if (!final) for (let size=1;size<5;size++) {
      if (namePending.endsWith('{ten}'.slice(0,size))) { cut=namePending.length-size; break; }
    }
    const part = namePending.slice(0, cut);
    namePending = namePending.slice(cut);
    return part;
  };
  const filter = new SentenceFilter(data.answerFragments, (text, blocked) => {
    const personalized = personalize(text);
    answer += personalized;
    if (blocked) { leakBlocked=true; emit('blocked',{}); }
    if (personalized) emit('delta',{text:personalized,blocked});
  });
  let timer=setTimeout(()=>abort.abort(),Math.max(0,timeoutMs-(Date.now()-started)));
  try {
    phase=Date.now();
    const stillEligible=await tutorEligible(db,id,env);
    timing.recheck_ms=Date.now()-phase;
    if (!stillEligible) throw new Error('Ineligible');
    if (!env.OPENAI_API_KEY || Date.now()-started>=timeoutMs) throw new Error('Unavailable');
    phase=Date.now();
    const counted=await db.prepare("UPDATE tutor_turns SET openai_calls=openai_calls+1 WHERE id=? AND status='streaming' AND attempt_token=? AND openai_calls<2 AND EXISTS(SELECT 1 FROM learning_lessons l LEFT JOIN ai_subject_controls c ON c.subject_id=l.subject_id WHERE l.id=tutor_turns.lesson_id AND coalesce(c.openai_enabled,1)=1)").bind(id,token).run();
    timing.count_ms=Date.now()-phase;
    if (!counted.meta.changes) throw new Error('Call limit');
    const openaiStarted=Date.now();
    const response=await fetcher('https://api.openai.com/v1/responses', {method:'POST',
      headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-6-luna',instructions:prompt,input:JSON.stringify(data.context),stream:true,store:false,
        reasoning:{effort:'none'},max_output_tokens:800}), signal:abort.signal,redirect:'manual'});
    if (!response.ok || !response.body) throw new Error('Unavailable');
    for await (const entry of records(response.body)) {
      if (entry.type==='response.output_text.delta' && typeof entry.delta==='string' && entry.delta) {
        if (firstMs===undefined) {
          firstMs=Date.now()-started;
          timing.openai_first_ms=Date.now()-openaiStarted;
          // Durations and the opaque turn ID only: never log prompts, learner data or credentials.
          console.info(JSON.stringify({component:'tutor-timing',turnId:id,first_token_ms:firstMs,...timing,...(preTiming ?? {})}));
          clearTimeout(timer); timer=setTimeout(()=>abort.abort(),60000);
        }
        rawLength += [...entry.delta].length;
        if (rawLength>2000 || entry.delta.includes('\0')) throw new Error('Response too long');
        if (offTopic === undefined) {
          classification += entry.delta;
          const newline=classification.indexOf('\n');
          if (newline < 0) { if (classification.length > 32) throw new Error('Missing scope classification'); continue; }
          const marker=classification.slice(0,newline).trim();
          if (marker !== 'ON_TOPIC' && marker !== 'OFF_TOPIC') throw new Error('Invalid scope classification');
          offTopic=marker === 'OFF_TOPIC' && !nameQuestion && !itemQuestion && !answerQuestion;
          if (nameQuestion) substitute=data.displayName ? 'Con gọi là {ten} nha! Quay lại bài này cùng con nhé.' : 'Con chưa biết tên ạ. Quay lại bài này cùng con nha!';
          else if (marker === 'OFF_TOPIC' && (itemQuestion || answerQuestion)) substitute='Con chưa nói đáp án đâu nha. Thử đọc lại đề và tìm điều câu hỏi yêu cầu trước nhé!';
          const rest=classification.slice(newline+1); classification='';
          if (!offTopic && !substitute) filter.push(rest);
        } else if (!offTopic && !substitute) filter.push(entry.delta);
      }
      if (entry.type==='response.completed') {
        const response=entry.response as {status?:string;usage?:{input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}}}|undefined;
        inputTokens=response?.usage?.input_tokens; outputTokens=response?.usage?.output_tokens;
        const cached=response?.usage?.input_tokens_details?.cached_tokens;
        cachedTokens=Number.isSafeInteger(cached) && cached! >= 0 && cached! <= (inputTokens ?? -1) ? cached : undefined;
        completed=response?.status==='completed' && Number.isSafeInteger(inputTokens) && Number.isSafeInteger(outputTokens) && inputTokens!>=0 && outputTokens!>=0;
      }
      if (entry.type==='response.failed' || entry.type==='error' || entry.type==='response.incomplete' || entry.type==='response.refusal.delta') throw new Error('Incomplete response');
    }
    if (offTopic === undefined) throw new Error('Missing scope classification');
    if (substitute) filter.push(substitute);
    if (offTopic) filter.push(`Hihi, chuyện đó để lúc khác nha, giờ con chỉ giúp bài này thôi ạ. Quay lại câu đang mở nhé?`);
    filter.finish();
    const tail=personalize('',true); answer+=tail; if (tail) emit('delta',{text:tail,blocked:false});
    const parsed=tutorAnswer.safeParse(answer);
    if (!completed || !parsed.success || firstMs===undefined) throw new Error('Incomplete response');
    const saved=await db.prepare(`UPDATE tutor_turns SET status='answered',answer=?,off_topic=?,leak_blocked=max(leak_blocked,?),first_token_ms=?,input_tokens=?,output_tokens=?,cached_tokens=?,answered_at=?,attempt_token=NULL,lease_expires_at=NULL
      WHERE id=? AND status='streaming' AND attempt_token=? AND EXISTS(SELECT 1 FROM learning_lessons l LEFT JOIN learner_settings s ON s.user_id=l.user_id
        JOIN lesson_items i ON i.lesson_id=l.id AND i.item_id=tutor_turns.item_id WHERE l.id=tutor_turns.lesson_id AND l.completed_at IS NULL AND coalesce(s.tutor_enabled,1)=1 AND i.flag IS NOT 'item_void'
        AND NOT EXISTS(SELECT 1 FROM ai_subject_controls c WHERE c.subject_id=l.subject_id AND c.openai_enabled=0) AND ?=1)`)
      .bind(parsed.data,Number(offTopic),Number(leakBlocked),firstMs,inputTokens,outputTokens,cachedTokens ?? null,new Date().toISOString(),id,token,Number(env.OPENAI_ENABLED==='true')).run();
    if (!saved.meta.changes) {
      await db.prepare("UPDATE tutor_turns SET status='blocked',attempt_token=NULL,lease_expires_at=NULL WHERE id=? AND status='streaming' AND attempt_token=?").bind(id,token).run();
      emit('error',{message:'Câu hỏi không còn trong bài đang làm.'}); return 'ineligible' as const;
    }
    emit('done',{id,status:'answered'}); return 'answered' as const;
  } catch {
    abort.abort();
    const saved=await db.prepare("UPDATE tutor_turns SET status=CASE WHEN openai_calls>=2 THEN 'failed' ELSE 'queued' END,leak_blocked=max(leak_blocked,?),attempt_token=NULL,lease_expires_at=NULL WHERE id=? AND status='streaming' AND attempt_token=? RETURNING status").bind(Number(leakBlocked),id,token).first<{status:string}>();
    if (saved?.status==='failed') { emit('error',{id,status:'failed',message:'Đã thử 2 lần nhưng chưa nhận được câu trả lời.'}); return 'failed' as const; }
    if (saved) { emit('queued',{id,status:'queued',message:TUTOR_BUSY}); return 'queued' as const; }
    return 'claimed' as const;
  } finally { clearTimeout(timer); }
}
