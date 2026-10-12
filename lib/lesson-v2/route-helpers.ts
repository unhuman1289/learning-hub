import { resolveLearner, type AccessAction } from '../access.ts';
import type { Db } from '../subjects/service.ts';

export const privateHeaders = { 'Cache-Control': 'private, no-store' };
export const LESSON_ID = /^les_[0-9a-f]{20}$/;

/** Common guard for /api/lessons/{id}/…: valid id, same origin for writes, and lib/access for the learner. */
export async function lessonTarget(db: Db, user: { id: string; role?: string | null }, req: Request, lessonId: string, action: AccessAction) {
  if (!LESSON_ID.test(lessonId)) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
  if (req.method !== 'GET' && req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers: privateHeaders });
  return resolveLearner(db, user, req, action);
}
