import {env} from 'cloudflare:workers';
import {getHubUser} from '../../../../lib/auth/session';
import {storage} from '../../../../db/storage';
import {apiFailure} from '../../../../lib/api-error';
import {enqueueCalibration} from '../../../../lib/calibration/jobs';

export const dynamic = 'force-dynamic';
const headers = {'Cache-Control':'private, no-store'};
async function access() {
  const user = await getHubUser();
  return user?.role === 'admin' ? null : Response.json({error:'Forbidden'}, {status:user ? 403 : 401,headers});
}
async function read() {
  const db = storage();
  const {results: calibrations=[]} = await db.prepare(`SELECT c.*, CASE WHEN j.status='succeeded' AND j.error GLOB 'invalid_submissions=[0-9]*' THEN CAST(substr(j.error,21) AS INTEGER) ELSE NULL END AS invalid FROM grader_calibrations c LEFT JOIN calibration_jobs j ON j.id=c.id ORDER BY c.created_at DESC,c.id DESC LIMIT 8`).all();
  const job = await db.prepare('SELECT id,status,calls,error,created_at,finished_at FROM calibration_jobs ORDER BY created_at DESC,rowid DESC LIMIT 1').first();
  return {calibrations,job};
}
export async function GET() {
  const denied = await access(); if (denied) return denied;
  try {return Response.json(await read(),{headers});} catch(e) {return apiFailure(e,'Chưa tải được hiệu chuẩn.',headers);}
}
export async function POST(req: Request) {
  const denied = await access(); if (denied) return denied;
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({error:'Origin rejected'},{status:403,headers});
  try {const job = await enqueueCalibration(storage(),env);return Response.json({job},{headers});}
  catch(e) {return apiFailure(e,'Chưa tạo được lượt hiệu chuẩn.',headers);}
}
