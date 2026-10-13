import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure } from '../../../../lib/api-error';
import { resolveLearner } from '../../../../lib/access';
import { readAttachment } from '../../../../lib/uploads/service';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };

/** A photo for its learner, or for a guardian or admin with ?learner=. Never public, never cached. */
export async function GET(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  const bucket = (env as unknown as Cloudflare.Env).UPLOADS;
  if (!bucket) return Response.json({ error: 'Kho ảnh chưa được cấu hình.' }, { status: 503, headers });
  try {
    const { id } = await context.params;
    if (!/^img_[0-9a-f]{20}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers });
    const db = storage();
    const learnerId = await resolveLearner(db, user, req, 'read_work');
    if (learnerId instanceof Response) return learnerId;
    const image = await readAttachment(db, bucket, learnerId, id);
    return new Response(image.body, { headers: { ...headers, 'Content-Type': image.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  } catch (error) {
    return apiFailure(error, 'Chưa mở được ảnh.', headers);
  }
}
