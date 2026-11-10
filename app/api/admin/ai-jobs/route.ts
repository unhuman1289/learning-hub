import { canAccessLearner } from '../../../../lib/access';
import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure, ApiError } from '../../../../lib/api-error';
import { enqueue } from '../../../../lib/ai-jobs/queue';
import {createManualPlan,readManualPlan} from '../../../../lib/ai-jobs/manual-plan';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: Request) {
  const user = await getHubUser();
  if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: user ? 403 : 401, headers });
  try {
    const url = new URL(req.url),
      status = url.searchParams.get('status'),
      learner = url.searchParams.get('learnerFilter'),
      kind = url.searchParams.get('kind'),
      id = url.searchParams.get('id');
    const db = storage();
    if (learner && !(await canAccessLearner(db, user, learner, 'read_progress'))) throw new ApiError(404, 'Không tìm thấy người học.');
    const requestId=url.searchParams.get('requestId');
    if(requestId){
      if(!learner)throw new ApiError(400,'Cần chọn người học.');
      return Response.json({job:await readManualPlan(db,learner,requestId)},{headers});
    }
    if (id) {
      const row = await db
        .prepare('SELECT id,kind,purpose,status,context_snapshot,outcome,usage,cost_usd,error,created_at,finished_at FROM ai_jobs WHERE id=?')
        .bind(id)
        .first();
      if (!row) throw new ApiError(404, 'Không tìm thấy lượt.');
      return Response.json({ job: row }, { headers });
    }
    const { results = [] } = await db
      .prepare(
        'SELECT j.id,j.learner_id,u.name AS learner_name,j.kind,j.purpose,j.trigger,j.status,j.created_at,j.finished_at,j.outcome,j.usage,j.cost_usd,j.error FROM ai_jobs j JOIN user u ON u.id=j.learner_id WHERE (? IS NULL OR j.status=?) AND (? IS NULL OR j.learner_id=?) AND (? IS NULL OR j.kind=?) ORDER BY j.created_at DESC LIMIT 100',
      )
      .bind(status, status, learner, learner, kind, kind)
      .all();
    return Response.json({ jobs: results }, { headers });
  } catch (e) {
    return apiFailure(e, 'Chưa tải được nhật ký xử lý.', headers);
  }
}
export async function POST(req: Request) {
  const user = await getHubUser();
  if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: user ? 403 : 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  try {
    const raw = await req.text();
    if (raw.length > 2000) throw new ApiError(413, 'Yêu cầu quá lớn.');
    const x = JSON.parse(raw) as Record<string, unknown>;
    if (
      Object.keys(x).some((k) => !['learnerId', 'subjectId', 'purpose','requestId'].includes(k)) ||
      typeof x.learnerId !== 'string' ||
      !['initial','daily'].includes(String(x.purpose)) ||
      (x.purpose==='daily'&&typeof x.requestId!=='string') ||
      (x.subjectId !== undefined && typeof x.subjectId !== 'string')
    )
      throw new ApiError(400, 'Dữ liệu không hợp lệ.');
    const db = storage(),
      learner = await db.prepare("SELECT id FROM user WHERE id=? AND status='active'").bind(x.learnerId).first();
    if (!learner) throw new ApiError(404, 'Không tìm thấy người học đang hoạt động.');
    if(x.purpose==='daily')return Response.json({job:await createManualPlan(db,env,x.learnerId,x.requestId as string,x.subjectId as string|undefined)},{headers});
    if (x.subjectId) {
      const subject = await db.prepare('SELECT id FROM subjects WHERE id=? AND learner_id=?').bind(x.subjectId, x.learnerId).first();
      if (!subject) throw new ApiError(404, 'Không tìm thấy sổ.');
    }
    if (x.purpose === 'initial' && !x.subjectId) throw new ApiError(400, 'Bài đầu cần chọn sổ.');
    return Response.json(
      {
        job: await enqueue(db, env, {
          learnerId: x.learnerId,
          kind: 'plan',
          purpose: 'initial',
          subjectId:x.subjectId as string,
        }),
      },
      { headers },
    );
  } catch (e) {
    return apiFailure(e, 'Chưa tạo được lượt soạn bài.', headers);
  }
}
