import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { resolveLearner } from '../../../../lib/access';
import { apiFailure, ApiError } from '../../../../lib/api-error';
import { recomputeSkill } from '../../../../lib/learner-model/recompute';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  try {
    const db = storage(),
      learner = await resolveLearner(db, user, req, 'edit_goals');
    if (learner instanceof Response) return learner;
    const { id } = await context.params;
    const raw = await req.text();
    if (raw.length > 2500) throw new ApiError(413, 'Yêu cầu quá lớn.');
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (Object.keys(p).some((k) => !['name', 'pathOrder', 'mastery', 'reason', 'revision'].includes(k)) || !Number.isInteger(p.revision))
      throw new ApiError(400, 'Dữ liệu không hợp lệ.');
    if (
      (p.name !== undefined && (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120)) ||
      (p.pathOrder !== undefined && (!Number.isInteger(p.pathOrder) || Number(p.pathOrder) < 0 || Number(p.pathOrder) > 120))
    )
      throw new ApiError(400, 'Tên hoặc thứ tự không hợp lệ.');
    if (
      p.mastery !== undefined &&
      (!['not_assessed', 'introduced', 'developing', 'demonstrated', 'needs_review'].includes(String(p.mastery)) ||
        typeof p.reason !== 'string' ||
        !p.reason.trim() ||
        p.reason.length > 500)
    )
      throw new ApiError(400, 'Đặt trạng thái cần lý do.');
    const skill = await db.prepare('SELECT id FROM skills WHERE id=? AND learner_id=?').bind(id, learner).first();
    if (!skill) throw new ApiError(404, 'Không tìm thấy kỹ năng.');
    const old = await db
      .prepare('SELECT revision FROM skill_states WHERE skill_id=? AND learner_id=?')
      .bind(id, learner)
      .first<{ revision: number }>();
    if (!old) {
      if (p.revision !== 0) throw new ApiError(409, 'Tiến độ đã đổi.');
      await recomputeSkill(db, learner, id);
    }
    const token = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "UPDATE skill_states SET mastery=coalesce(?,mastery),mastery_source=CASE WHEN ? IS NULL THEN mastery_source ELSE 'guardian' END,mastery_reason=coalesce(?,mastery_reason),recompute_token=?,revision=revision+1 WHERE skill_id=? AND learner_id=? AND revision=?",
        )
        .bind(p.mastery ?? null, p.mastery ?? null, p.reason ?? null, token, id, learner, p.revision),
      db
        .prepare(
          'UPDATE skills SET name=coalesce(?,name),path_order=coalesce(?,path_order),updated_at=? WHERE id=? AND learner_id=? AND EXISTS(SELECT 1 FROM skill_states WHERE skill_id=? AND recompute_token=?)',
        )
        .bind(p.name ?? null, p.pathOrder ?? null, new Date().toISOString(), id, learner, id, token),
    ]);
    const saved = await db.prepare('SELECT * FROM skill_states WHERE skill_id=? AND learner_id=?').bind(id, learner).first<Record<string, unknown>>();
    if (saved?.recompute_token !== token) throw new ApiError(409, 'Tiến độ đã đổi. Tải lại trước khi sửa.');
    return Response.json({ state: saved }, { headers });
  } catch (e) {
    return apiFailure(e, 'Chưa lưu được kỹ năng.', headers);
  }
}
