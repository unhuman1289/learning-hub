import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure, ApiError } from '../../../../lib/api-error';
import { initializeAiControls, setAiControls } from '../../../../lib/ai-controls';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
async function access() {
  const user = await getHubUser();
  if (!user || user.role !== 'admin') return { response: Response.json({error:'Forbidden'}, {status:user ? 403 : 401, headers}) };
  return {user};
}
async function read() {
  const db=storage();
  await initializeAiControls(db,env);
  const {results: controls=[]}=await db.prepare(`SELECT s.id,s.title,u.name AS learner_name,coalesce(c.openai_enabled,1) AS openai_enabled,
    coalesce(c.tts_enabled,1) AS tts_enabled,c.updated_by,c.updated_at FROM subjects s JOIN user u ON u.id=s.learner_id
    LEFT JOIN ai_subject_controls c ON c.subject_id=s.id WHERE s.status<>'archived' ORDER BY u.name,s.title,s.id`).all();
  const {results: log=[]}=await db.prepare('SELECT * FROM ai_control_log ORDER BY changed_at DESC,id DESC LIMIT 200').all();
  return {controls,log};
}
export async function GET() {
  const auth=await access(); if ('response' in auth) return auth.response;
  try { return Response.json(await read(),{headers}); } catch(e) { return apiFailure(e,'Chưa tải được cài đặt AI.',headers); }
}
export async function PUT(req:Request) {
  const auth=await access(); if ('response' in auth) return auth.response;
  if (req.headers.get('origin')!==new URL(req.url).origin) return Response.json({error:'Origin rejected'},{status:403,headers});
  try {
    const body=await req.json() as Record<string,unknown>;
    if (!body || Object.keys(body).some(k=>!['subjectId','openaiEnabled','ttsEnabled'].includes(k)) || typeof body.subjectId!=='string' ||
      typeof body.openaiEnabled!=='boolean' || typeof body.ttsEnabled!=='boolean') throw new ApiError(400,'Dữ liệu không hợp lệ.');
    const db=storage();
    if (!await db.prepare('SELECT id FROM subjects WHERE id=?').bind(body.subjectId).first()) throw new ApiError(404,'Không tìm thấy sổ.');
    await setAiControls(db,env,body.subjectId,{openaiEnabled:body.openaiEnabled,ttsEnabled:body.ttsEnabled},auth.user.id);
    return Response.json(await read(),{headers});
  } catch(e) { return apiFailure(e,'Chưa lưu được cài đặt AI.',headers); }
}
