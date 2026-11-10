import {getHubUser} from '../../../../../lib/auth/session';
import {storage} from '../../../../../db/storage';
import {apiFailure} from '../../../../../lib/api-error';
import {readLessonSubmissions} from '../../../../../lib/evidence/submit';
import {readLessonV2} from '../../../../../lib/lesson-v2/store';
import {lessonTarget,privateHeaders} from '../../../../../lib/lesson-v2/route-helpers';
export const dynamic='force-dynamic';
export async function GET(req:Request,context:{params:Promise<{id:string}>}){
 const user=await getHubUser();if(!user)return Response.json({error:'Sign in required'},{status:401,headers:privateHeaders});
 try{const {id}=await context.params,db=storage(),learner=await lessonTarget(db,user,req,id,'read_work');if(learner instanceof Response)return learner;
 const lesson=await readLessonV2(db,learner,id);
 return Response.json({submissions:await readLessonSubmissions(db,learner,id),lesson:{items:lesson.items,stages:lesson.stages}},{headers:privateHeaders});
 }catch(e){return apiFailure(e,'Chưa tải được lời phê đã lưu.',privateHeaders);}
}
