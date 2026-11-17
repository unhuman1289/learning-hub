import { env } from 'cloudflare:workers';
import { storage } from '../../../../../db/storage';
import { getHubUser } from '../../../../../lib/auth/session';
import { getTutor } from '../../../../../lib/tutor/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  return getTutor(req, await getHubUser(), storage, (await context.params).id, env.OPENAI_ENABLED === 'true');
}
