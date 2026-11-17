import type { Viewer } from '../access.ts';
import { runnerStatus } from '../ai-jobs/lease.ts';
import { apiFailure } from '../api-error.ts';
import { tutorQuestion } from '../contracts/tutor.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { lessonTarget, privateHeaders } from '../lesson-v2/route-helpers.ts';
import type { TutorRelay } from './relay.ts';
import { openTutorTurn, readTutorTurns, tutorStream, TUTOR_QUEUED_MESSAGE } from './service.ts';

export async function postTutor(req: Request, user: Viewer | null, storage: () => EvidenceDb, runnerId: string, relay?: TutorRelay, relayStub?: DurableObjectStub) {
  const started = performance.now();
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

    if (relayStub) {
      const turn = await openTutorTurn(db, learnerId, input.data, false);
      try {
        const response = await relayStub.fetch('https://tutor.internal/submit', {method:'POST', body:JSON.stringify({id:turn.id})});
        return new Response(response.body, {status:response.status, headers:{...Object.fromEntries(response.headers), ...privateHeaders}});
      } catch {
        // The relay may have claimed or completed the turn before the response failed.
        const saved = await db.prepare('SELECT status FROM tutor_turns WHERE id=?').bind(turn.id).first<{status:string}>();
        return Response.json({id:turn.id, status:saved?.status ?? 'unknown', message:'Mở lại để xem trạng thái câu hỏi.'}, {status:202, headers:privateHeaders});
      }
    }
    const activeRelay = relay && (await runnerStatus(db, runnerId)).online ? relay : undefined;
    const turn = await openTutorTurn(db, learnerId, input.data, !!activeRelay);
    if (!activeRelay) {
      return Response.json({ id: turn.id, status: turn.status, message: TUTOR_QUEUED_MESSAGE }, { status: 202, headers: privateHeaders });
    }
    return new Response(tutorStream(db, turn, activeRelay, started), {
      headers: { ...privateHeaders, 'Content-Type': 'text/event-stream; charset=utf-8' },
    });
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
