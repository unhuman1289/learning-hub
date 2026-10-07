import {getChatGPTUser} from '../../chatgpt-auth';
import {readDaily} from '../../../lib/daily-store';
import {apiFailure} from '../../../lib/api-error';
import {storage} from '../../../db/storage';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){
 if(!await getChatGPTUser())return Response.json({error:'Sign in required'},{status:401,headers});
 try{return Response.json(await readDaily(),{headers});}catch(e){console.error(e);return Response.json({error:'Không tải được bài học. Hãy thử lại.'},{status:503,headers});}
}
export async function POST(req:Request){
 if(!await getChatGPTUser())return Response.json({error:'Sign in required'},{status:401,headers});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403,headers});
 try{
  const x=await req.json() as {id:string,expectedUpdated:string,response:string,completed:boolean};
  if(!x||typeof x!=='object'||typeof x.id!=='string'||typeof x.expectedUpdated!=='string'||typeof x.response!=='string'||x.response.length>18000||typeof x.completed!=='boolean')return Response.json({error:'Dữ liệu không hợp lệ'},{status:400,headers});
  const stamp=new Date().toISOString();
  const r=await storage().prepare('UPDATE learning_lessons SET response=?, completed_at=CASE WHEN ?=0 THEN NULL ELSE COALESCE(completed_at,?) END, updated=? WHERE id=? AND updated=? AND EXISTS(SELECT 1 FROM learning_slots WHERE lesson_id=?)').bind(x.response,x.completed?1:0,stamp,stamp,x.id,x.expectedUpdated,x.id).run();
  if(!r.meta.changes)return Response.json({error:'Bài học đã thay đổi trên thiết bị khác. Sao chép câu trả lời trước khi tải lại.'},{status:409,headers});
  return Response.json(await readDaily(),{headers});
 }catch(e){return apiFailure(e,'Chưa lưu được. Câu trả lời vẫn được giữ trên trang.',headers);}
}
