import { env } from 'cloudflare:workers';
import { storage } from '../../../db/storage';
import { apiFailure, ApiError } from '../../../lib/api-error';
import {
  MANAGE_COOKIE,
  MANAGE_HOURS,
  PROFILE_COOKIE,
  cookie,
  householdMode,
  manageActive,
  profileFromCookie,
  signValue,
} from '../../../lib/household';
import { activeProfile, archiveProfile, checkManagePin, createProfile, listProfiles, setManagePin } from '../../../lib/profiles';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Family profiles (docs/plan/LOCAL-GRADER.md L5). Exists only behind the household gate. */
export async function GET(req: Request) {
  if (!householdMode(env)) return Response.json({ error: 'Not found' }, { status: 404, headers });
  try {
    const cookies = req.headers.get('cookie');
    return Response.json(
      {
        profiles: await listProfiles(storage(), env.HOUSEHOLD_LEGACY_PROFILE_IDS),
        current: await profileFromCookie(cookies, env.PROFILE_COOKIE_SECRET),
        manage: await manageActive(cookies, env.PROFILE_COOKIE_SECRET),
      },
      { headers },
    );
  } catch (e) {
    return apiFailure(e, 'Không đọc được danh sách hồ sơ.', headers);
  }
}

export async function POST(req: Request) {
  if (!householdMode(env)) return Response.json({ error: 'Not found' }, { status: 404, headers });
  try {
    const origin = env.APP_ORIGIN || new URL(req.url).origin;
    if (req.headers.get('Origin') !== origin || !req.headers.get('Content-Type')?.startsWith('application/json'))
      throw new ApiError(403, 'Yêu cầu phải đến từ Learning Hub.');
    const db = storage(),
      cookies = req.headers.get('cookie'),
      secure = new URL(req.url).protocol === 'https:',
      body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.action !== 'string') throw new ApiError(400, 'Yêu cầu không hợp lệ.');
    const manage = await manageActive(cookies, env.PROFILE_COOKIE_SECRET);
    const reply = (value: unknown, ...setCookies: string[]) => {
      const h = new Headers(headers);
      for (const c of setCookies) h.append('Set-Cookie', c);
      return Response.json(value, { headers: h });
    };
    switch (body.action) {
      case 'select': {
        const id = await activeProfile(db, body.id, env.HOUSEHOLD_LEGACY_PROFILE_IDS);
        // Switching person always leaves manage mode.
        return reply(
          { current: id },
          cookie(PROFILE_COOKIE, await signValue(env.PROFILE_COOKIE_SECRET, id), 365 * 86400, secure),
          cookie(MANAGE_COOKIE, '', 0, secure),
        );
      }
      case 'leave':
        return reply({ current: null }, cookie(PROFILE_COOKIE, '', 0, secure), cookie(MANAGE_COOKIE, '', 0, secure));
      case 'manage': {
        if (!(await checkManagePin(db, body.pin))) throw new ApiError(403, 'PIN chưa đúng.');
        const until = String(Math.floor(Date.now() / 1000) + MANAGE_HOURS * 3600);
        return reply({ manage: true }, cookie(MANAGE_COOKIE, await signValue(env.PROFILE_COOKIE_SECRET, until), MANAGE_HOURS * 3600, secure));
      }
      case 'unmanage':
        return reply({ manage: false }, cookie(MANAGE_COOKIE, '', 0, secure));
      case 'create':
        if (!manage) throw new ApiError(403, 'Bật chế độ quản lý để thêm hồ sơ.');
        return reply({ profile: await createProfile(db, body) });
      case 'archive':
        if (!manage) throw new ApiError(403, 'Bật chế độ quản lý để ẩn hồ sơ.');
        await archiveProfile(db, body.id);
        return reply({ archived: true });
      case 'pin':
        if (!manage) throw new ApiError(403, 'Bật chế độ quản lý để đặt PIN.');
        await setManagePin(db, body.pin ?? null);
        return reply({ pin: body.pin ? 'set' : 'cleared' });
      default:
        throw new ApiError(400, 'Yêu cầu không hợp lệ.');
    }
  } catch (e) {
    return apiFailure(e, 'Chưa lưu được thay đổi hồ sơ.', headers);
  }
}
