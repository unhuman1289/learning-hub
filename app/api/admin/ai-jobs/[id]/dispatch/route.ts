import {env} from 'cloudflare:workers';
import {getHubUser} from '../../../../../../lib/auth/session';
import {storage} from '../../../../../../db/storage';
import {apiFailure,ApiError} from '../../../../../../lib/api-error';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function POST(req:Request,context:{params:Promise<{id:string}>}){
 const user=await getHubUser();if(!user||user.role!=='admin')return Response.json({error:'Forbidden'},{status:user?403:401,headers});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403,headers});
 try{
  const {id}=await context.params;
  if(!/^job_[a-z0-9]{20}$/.test(id))throw new ApiError(400,'Mã lượt không hợp lệ.');
  const job=await storage().prepare("SELECT id FROM ai_jobs WHERE id=? AND status='queued'").bind(id).first();
  if(!job)throw new ApiError(409,'Lượt không còn đang chờ.');
  if(!env.EVENT_DISPATCHER)throw new ApiError(503,'Chưa có kết nối gửi sự kiện.');
  return Response.json(await env.EVENT_DISPATCHER.dispatch(id),{headers});
 }catch(e){return apiFailure(e,'Chưa xác nhận gửi sự kiện. Lượt đã lưu được giữ nguyên.',headers);}
}
