import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../lib/auth/session';
import { createStoredBackup, getLatestStoredBackup } from '../../../../lib/backup-store';
import { apiFailure } from '../../../../lib/api-error';
import { storage } from '../../../../db/storage';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

async function requireAdmin() {
  const user = await getHubUser();
  if (!user) return { response: Response.json({ error: 'Sign in required' }, { status: 401, headers }) };
  if (user.role !== 'admin') return { response: Response.json({ error: 'Admin access required' }, { status: 403, headers }) };
  const bucket = (env as unknown as Cloudflare.Env).BUCKET;
  if (!bucket) return { response: Response.json({ error: 'Backup storage is unavailable.' }, { status: 503, headers }) };
  return { user, bucket };
}

export async function GET() {
  const access = await requireAdmin();
  if ('response' in access) return access.response;
  try {
    const environment = (env as unknown as Cloudflare.Env).ENVIRONMENT ?? 'unknown';
    const latest = await getLatestStoredBackup(access.bucket, environment);
    if (!latest) return Response.json({ error: 'Chưa có bản sao trong R2.' }, { status: 404, headers });
    return new Response(latest.object.body, {
      headers: {
        ...headers,
        'Content-Type': latest.object.httpMetadata?.contentType ?? 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="learning-hub-r2-${latest.uploadedAt?.slice(0, 10) ?? 'latest'}.json"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiFailure(error, 'Không tải được bản sao R2.', headers);
  }
}

export async function POST(request: Request) {
  const access = await requireAdmin();
  if ('response' in access) return access.response;
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  }

  try {
    const backup = await createStoredBackup(storage(), access.bucket, {
      environment: (env as unknown as Cloudflare.Env).ENVIRONMENT ?? 'unknown',
      deploymentId: (env as unknown as Cloudflare.Env).DEPLOYMENT_ID ?? 'learning-hub',
      createdBy: access.user.id,
    });
    return Response.json({ ...backup, retentionWarning: backup.retentionWarning || undefined }, { headers });
  } catch (error) {
    return apiFailure(error, 'Không tạo được bản sao lưu R2. Chưa xác nhận hoàn tất; hãy kiểm tra trạng thái trước khi thử lại.', headers);
  }
}
