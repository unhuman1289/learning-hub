import { env } from 'cloudflare:workers';
import { storage } from '../../../db/storage';
import { getHubUser } from '../../../lib/auth/session';
import { postTutor } from '../../../lib/tutor/http';
import { fakeTutorRelay } from '../../../lib/tutor/relay';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const stub = env.ENVIRONMENT !== 'production' && env.TUTOR_RELAY ? env.TUTOR_RELAY.get(env.TUTOR_RELAY.idFromName('tutor'), {locationHint:'weur'}) : undefined;
  const relay = !stub && env.ENVIRONMENT === 'local' && env.APP_ENV === 'local' ? fakeTutorRelay : undefined;
  return postTutor(req, await getHubUser(), storage, env.GRADER_CLIENT_ID ?? 'home-runner', relay, stub);
}
