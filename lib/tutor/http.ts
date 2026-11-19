import type { Viewer } from '../access.ts';
import { apiFailure } from '../api-error.ts';
import { berlinDay, cutoffFor } from '../daily-policy.ts';
import { addDays } from '../learner-model/rules.ts';
import { answerTutor, dispatchTutor } from './openai.ts';
import { tutorQuestion, TUTOR_DAY_LIMIT, TUTOR_TURN_LIMIT } from '../contracts/tutor.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { lessonTarget, privateHeaders } from '../lesson-v2/route-helpers.ts';
import { openTutorTurn, readTutorTurns } from './service.ts';

export async function postTutor(req: Request, user: Viewer | null, storage: () => EvidenceDb, openai: {env: Cloudflare.Env; prompt:string; fetcher?:typeof fetch}) {
  const startedAt=Date.now();
  const timing={body_ms:0,access_ms:0,notebook_ms:0,open_turn_ms:0};
  let phase=Date.now();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return Response.json({ error: 'Origin rejected' }, { status: 403, headers: privateHeaders });
  }
  try {
    const input = tutorQuestion.safeParse(await req.json());
    timing.body_ms=Date.now()-phase;
    if (!input.success) {
      return Response.json({ error: 'Chọn câu trong bài và nhập câu hỏi tối đa 500 ký tự.' }, { status: 400, headers: privateHeaders });
    }
    const db = storage();
    phase=Date.now();
    const learnerId = await lessonTarget(db, user, req, input.data.lessonId, 'edit_work');
    timing.access_ms=Date.now()-phase;
    if (learnerId instanceof Response) return learnerId;

    {
      phase=Date.now();
      const settings = await db.prepare(`SELECT l.subject_id FROM learning_lessons l
        JOIN subjects s ON s.id=l.subject_id LEFT JOIN ai_subject_controls c ON c.subject_id=s.id
        WHERE l.id=? AND l.user_id=? AND coalesce(c.openai_enabled,1)=1`).bind(input.data.lessonId,learnerId)
        .first<{subject_id:string}>();
      if (!settings || openai.env.OPENAI_ENABLED !== 'true')
        return Response.json({error:'Gia sư chưa được bật cho sổ này.'}, {status:403,headers:privateHeaders});
      timing.notebook_ms=Date.now()-phase;
      phase=Date.now();
      const turn = await openTutorTurn(db, learnerId, input.data, false);
      timing.open_turn_ms=Date.now()-phase;
      const encoder=new TextEncoder(); let cancelled=false;
      const stream=new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit=(event:string,data:object) => { if (!cancelled) try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { cancelled=true; } };
          try {
            const state=await answerTutor(db,openai.env,turn.id,openai.prompt,emit,openai.fetcher,10000,startedAt,timing);
            if (state==='queued') await dispatchTutor(openai.env,turn.id).catch(()=>console.error('Tutor queue dispatch failed; turn retained.'));
            if (state==='ineligible') { await db.prepare("UPDATE tutor_turns SET status='blocked' WHERE id=? AND status='queued'").bind(turn.id).run(); emit('error',{message:'Câu hỏi không còn trong bài đang làm.'}); }
          } catch { emit('error',{message:'Mở lại để xem trạng thái câu hỏi.'}); }
          finally { if (!cancelled) controller.close(); }
        },
        cancel(){cancelled=true;},
      });
      return new Response(stream,{headers:{...privateHeaders,'Content-Type':'text/event-stream; charset=utf-8'}});
    }
  } catch (error) {
    return apiFailure(error, 'Chưa gửi được câu hỏi.', privateHeaders);
  }
}

export async function getTutor(req: Request, user: Viewer | null, storage: () => EvidenceDb, id: string, enabled = true) {
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, id, 'read_work');
    if (learnerId instanceof Response) return learnerId;
    const turns = await readTutorTurns(db, learnerId, id);
    const day = berlinDay();
    const info = await db.prepare(`SELECT s.display_name,coalesce(s.tutor_enabled,1) AS tutor_enabled,
      coalesce(c.openai_enabled,1) AS openai_enabled,
      (SELECT count(*) FROM tutor_turns WHERE learner_id=? AND created_at>=? AND created_at<?) AS today
      FROM learning_lessons l LEFT JOIN learner_settings s ON s.user_id=l.user_id
      LEFT JOIN ai_subject_controls c ON c.subject_id=l.subject_id WHERE l.id=? AND l.user_id=?`)
      .bind(learnerId,cutoffFor(day),cutoffFor(addDays(day,1)),id,learnerId)
      .first<{display_name:string|null;tutor_enabled:number;openai_enabled:number;today:number}>();
    const lessonRemaining = Math.max(0, TUTOR_TURN_LIMIT-turns.length);
    const dayRemaining = Math.max(0, TUTOR_DAY_LIMIT-(info?.today ?? 0));
    return Response.json({ turns, displayName:info?.display_name ?? '', enabled: enabled && !!info?.tutor_enabled && !!info?.openai_enabled,
      remaining: Math.min(lessonRemaining, dayRemaining), limit: lessonRemaining <= dayRemaining ? 'lesson' : 'day' }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa đọc được các lượt hỏi gia sư.', privateHeaders);
  }
}
