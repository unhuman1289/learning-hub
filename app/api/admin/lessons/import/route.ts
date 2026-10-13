import {getHubUser} from '../../../../../lib/auth/session';
import {storage} from '../../../../../db/storage';
import {apiFailure,ApiError} from '../../../../../lib/api-error';
import {importLesson} from '../../../../../lib/lesson-v2/import';
import {privateHeaders} from '../../../../../lib/lesson-v2/route-helpers';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const user=await getHubUser();if(!user)return Response.json({error:'Sign in required'},{status:401,headers:privateHeaders});
 if(user.role!=='admin')return Response.json({error:'Admin access required'},{status:403,headers:privateHeaders});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403,headers:privateHeaders});
 try{const raw=await req.text();if(new TextEncoder().encode(raw).length>110000)return Response.json({error:'Bài quá lớn'},{status:413,headers:privateHeaders});
 let body:unknown;try{body=JSON.parse(raw);}catch{throw new ApiError(400,'Gói bài không phải JSON hợp lệ.');}const result=await importLesson(storage(),body);return Response.json(result,{status:result.issues.length?422:201,headers:privateHeaders});
 }catch(e){return apiFailure(e,'Chưa nhập được bài.',privateHeaders);}
}
