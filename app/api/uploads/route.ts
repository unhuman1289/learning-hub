import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { apiFailure } from '../../../lib/api-error';
import { createAttachment, MAX_UPLOAD_BYTES } from '../../../lib/uploads/service';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Uploads a photo of the learner's own work (raw image body). Returns {attachment}. */
export async function POST(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  const bucket = (env as unknown as Cloudflare.Env).UPLOADS;
  if (!bucket) return Response.json({ error: 'Kho ảnh chưa được cấu hình.' }, { status: 503, headers });
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_UPLOAD_BYTES) return Response.json({ error: 'Ảnh cần nhỏ hơn 3 MB.' }, { status: 413, headers });
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    return Response.json({ attachment: await createAttachment(storage(), bucket, user.id, bytes) }, { status: 201, headers });
  } catch (error) {
    return apiFailure(error, 'Chưa tải được ảnh lên.', headers);
  }
}
