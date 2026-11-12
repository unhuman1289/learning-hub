import {env} from 'cloudflare:workers';
import {getHubUser} from '../../../../../lib/auth/session';
import {storage} from '../../../../../db/storage';
import {resolveLearner} from '../../../../../lib/access';
import {apiFailure,ApiError} from '../../../../../lib/api-error';
import {createRequest,parseRequest} from '../../../../../lib/requests/service';
import {readRoadmapProgress} from '../../../../../lib/roadmap/report';

const headers={'Cache-Control':'private, no-store'};
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(env.HUB2_ENABLED!=='true')return Response.json({error:'Không tìm thấy.'},{status:404,headers});
 const user=await getHubUser();
 if(!user||req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Cần đăng nhập.'},{status:403,headers});
 try{
  const {id}=await params;
  const input=await req.json().catch(()=>null) as {action?:string;stepId?:string;clientRequestId?:string}|null;
  if(!input||typeof input.stepId!=='string'||!/^[-_:a-zA-Z0-9]{1,128}$/.test(input.stepId)||!['skip','practice'].includes(input.action??''))throw new ApiError(400,'Yêu cầu bước học chưa hợp lệ.');
  const db=storage();
  const learner=await resolveLearner(db,user,req,input.action==='skip'?'edit_goals':'edit_work');
  if(learner instanceof Response)return learner;
  if(input.action==='practice'){
   const request=await createRequest(db,env,learner,user.id,parseRequest({subjectId:id,mode:'practice',stepId:input.stepId,clientRequestId:input.clientRequestId}));
   return Response.json({request},{headers});
  }
  const stamp=new Date().toISOString();
  const done=await db.prepare(`UPDATE roadmap_steps SET status='passed',passed_via='learner',passed_at=?,updated_at=?,revision=revision+1
    WHERE id=? AND learner_id=? AND subject_id=? AND status IN ('planned','practising')
    AND EXISTS(SELECT 1 FROM subjects WHERE id=? AND learner_id=? AND status='active')`)
    .bind(stamp,stamp,input.stepId,learner,id,id,learner).run();
  if(!done.meta.changes)throw new ApiError(409,'Bước này vừa đổi hoặc đang có bài mở.');
  return Response.json({progress:await readRoadmapProgress(db,learner,id)},{headers});
 }catch(error){return apiFailure(error,'Chưa lưu được bước học.',headers);}
}
