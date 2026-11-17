import { env } from 'cloudflare:workers';
import { storage } from '../../../db/storage';
import { getHubUser } from '../../../lib/auth/session';
import { postTutor } from '../../../lib/tutor/http';
import { fakeTutorOpenAi } from '../../../lib/tutor/fake-openai';
import prompt from '../../../integrations/runner-prompts/tutor.md?raw';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const local = env.ENVIRONMENT === 'local' && env.APP_ENV === 'local';
  const user = await getHubUser();
  if (local && !user) await req.arrayBuffer();
  return postTutor(req, user, storage, {env: local ? {...env, OPENAI_API_KEY:'local-fixture'} : env, prompt, ...(local ? {fetcher:fakeTutorOpenAi} : {})});
}
