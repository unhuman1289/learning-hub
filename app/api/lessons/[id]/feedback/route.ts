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
 const query = new URL(req.url).searchParams;
 const watch = query.get('watch');
 if (watch !== null) {
   const attempts = watch.split(',').filter(Boolean);
   const rechecks = (query.get('rechecks') ?? '').split(',').filter(Boolean);
   if (attempts.length > 25 || rechecks.length > 25 || [...attempts, ...rechecks].some(value => !/^att_[a-f0-9]{20}$/.test(value)))
     return Response.json({ error: 'Lượt chấm không hợp lệ.' }, { status: 400, headers: privateHeaders });
   const changed = await db.prepare(`SELECT EXISTS(
     SELECT 1 FROM attempts a JOIN submissions s ON s.id=a.submission_id
     LEFT JOIN ai_jobs j ON j.id=s.ai_job_id
     WHERE a.lesson_id=? AND a.learner_id=? AND a.id IN (SELECT value FROM json_each(?))
       AND CASE WHEN a.id IN (SELECT value FROM json_each(?)) THEN
         coalesce((SELECT d.status FROM disputes d WHERE d.attempt_id=a.id ORDER BY d.created_at DESC LIMIT 1),'') <> 'rechecking'
       ELSE a.status <> 'pending' OR j.status IN ('cancelled','failed','expired') END
   ) AS ready`).bind(id,learner,JSON.stringify(attempts),JSON.stringify(rechecks)).first<{ready:number}>();
   return Response.json({ changed: changed?.ready === 1 }, { headers: privateHeaders });
 }
 const lesson=await readLessonV2(db,learner,id);
 return Response.json({submissions:await readLessonSubmissions(db,learner,id),lesson:{items:lesson.items,stages:lesson.stages}},{headers:privateHeaders});
 }catch(e){return apiFailure(e,'Chưa tải được lời phê đã lưu.',privateHeaders);}
}
