import { env } from 'cloudflare:workers';
import { storage } from '../../../../db/storage';
import { apiFailure, ApiError } from '../../../../lib/api-error';
import { playAudio } from '../../../../lib/audio/playback';
import { getHubUser } from '../../../../lib/auth/session';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(req: Request, context: { params: Promise<{ hash: string }> }) {
  try {
    const user = await getHubUser();
    if (!user) throw new ApiError(401, 'Cần đăng nhập.');
    if (!env.UPLOADS) throw new ApiError(503, 'Kho âm thanh chưa được cấu hình.');
    return await playAudio(storage(), env.UPLOADS, user, req, (await context.params).hash);
  } catch (error) {
    return apiFailure(error, 'Chưa mở được âm thanh.', headers);
  }
}
