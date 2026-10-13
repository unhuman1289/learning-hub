import {env} from 'cloudflare:workers';
import {readCurrentV2} from '../../../lib/lesson-v2/daily';
import {getHubUser} from '../../../lib/auth/session';
import {readDaily} from '../../../lib/daily-store';
import {apiFailure} from '../../../lib/api-error';
import {storage} from '../../../db/storage';
import {resolveLearner} from '../../../lib/access';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
// GET ?learner=<id> lets a guardian or admin read another learner's lessons; writes stay with the learner.
export async function GET(req:Request){
 const user=await getHubUser();
 if(!user)return Response.json({error:'Sign in required'},{status:401,headers});
 try{
  const learnerId=await resolveLearner(storage(),user,req,'read_work');
  if(learnerId instanceof Response)return learnerId;
  const daily=await readDaily(learnerId,user.role==='admin'&&learnerId===user.id);return Response.json({...daily,...(env.HUB2_ENABLED==='true'?{v2Active:await readCurrentV2(storage(),learnerId)}:{})},{headers});
 }catch(e){console.error(e);return Response.json({error:'Không tải được bài học. Hãy thử lại.'},{status:503,headers});}
}
export async function POST(req:Request){
 const user=await getHubUser();
 if(!user)return Response.json({error:'Sign in required'},{status:401,headers});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403,headers});
 try{
  const x=await req.json() as {id:string,expectedUpdated:string,response:string,completed:boolean};
  if(!x||typeof x!=='object'||typeof x.id!=='string'||typeof x.expectedUpdated!=='string'||typeof x.response!=='string'||x.response.length>18000||typeof x.completed!=='boolean')return Response.json({error:'Dữ liệu không hợp lệ'},{status:400,headers});
  const stamp=new Date().toISOString();
  const r=await storage().prepare('UPDATE learning_lessons SET response=?, completed_at=CASE WHEN ?=0 THEN NULL ELSE COALESCE(completed_at,?) END, updated=? WHERE user_id=? AND id=? AND updated=? AND EXISTS(SELECT 1 FROM learning_slots WHERE user_id=? AND lesson_id=?)').bind(x.response,x.completed?1:0,stamp,stamp,user.id,x.id,x.expectedUpdated,user.id,x.id).run();
  if(!r.meta.changes)return Response.json({error:'Bài học đã thay đổi trên thiết bị khác. Sao chép câu trả lời trước khi tải lại.'},{status:409,headers});
  return Response.json(await readDaily(user.id,user.role==='admin'),{headers});
 }catch(e){return apiFailure(e,'Chưa lưu được. Câu trả lời vẫn được giữ trên trang.',headers);}
}
