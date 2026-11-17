import type { Viewer } from '../access.ts';
import { apiFailure } from '../api-error.ts';
import { aiSubjects } from '../ai-controls.ts';
import { answerTutor, dispatchTutor } from './openai.ts';
import { tutorQuestion } from '../contracts/tutor.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { lessonTarget, privateHeaders } from '../lesson-v2/route-helpers.ts';
import { openTutorTurn, readTutorTurns } from './service.ts';

export async function postTutor(req: Request, user: Viewer | null, storage: () => EvidenceDb, openai: {env: Cloudflare.Env; prompt:string; fetcher?:typeof fetch}) {
  const startedAt=Date.now();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return Response.json({ error: 'Origin rejected' }, { status: 403, headers: privateHeaders });
  }
  try {
    const input = tutorQuestion.safeParse(await req.json());
    if (!input.success) {
      return Response.json({ error: 'Chọn câu trong bài và nhập câu hỏi tối đa 500 ký tự.' }, { status: 400, headers: privateHeaders });
    }
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, input.data.lessonId, 'edit_work');
    if (learnerId instanceof Response) return learnerId;

    {
      const settings = await db.prepare(`SELECT l.subject_id,coalesce(s.role,'adult') AS role FROM learning_lessons l
        LEFT JOIN learner_settings s ON s.user_id=l.user_id WHERE l.id=? AND l.user_id=?`).bind(input.data.lessonId,learnerId)
        .first<{subject_id:string;role:string}>();
      if (!settings || settings.role!=='adult' || !(await aiSubjects(db, openai.env)).includes(settings.subject_id))
        return Response.json({error:'Gia sư chưa được bật cho sổ này.'}, {status:403,headers:privateHeaders});
      const turn = await openTutorTurn(db, learnerId, input.data, false);
      const encoder=new TextEncoder(); let cancelled=false;
      const stream=new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit=(event:string,data:object) => { if (!cancelled) try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { cancelled=true; } };
          try {
            const state=await answerTutor(db,openai.env,turn.id,openai.prompt,emit,openai.fetcher,10000,startedAt);
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

export async function getTutor(req: Request, user: Viewer | null, storage: () => EvidenceDb, id: string) {
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, id, 'read_work');
    if (learnerId instanceof Response) return learnerId;
    return Response.json({ turns: await readTutorTurns(db, learnerId, id) }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa đọc được các lượt hỏi gia sư.', privateHeaders);
  }
}
