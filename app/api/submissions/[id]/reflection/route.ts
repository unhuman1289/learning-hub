import {env} from 'cloudflare:workers';
import {getHubUser} from '../../../../../lib/auth/session';
import {storage} from '../../../../../db/storage';
import {apiFailure} from '../../../../../lib/api-error';
import {readReflection,saveReflection} from '../../../../../lib/lesson-reflection';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){
 if(env.HUB2_ENABLED!=='true')return Response.json({error:'Not found'},{status:404,headers});
 const user=await getHubUser();if(!user)return Response.json({error:'Sign in required'},{status:401,headers});
 try{return Response.json({reflection:await readReflection(storage(),user.id,(await context.params).id)},{headers});}catch(e){return apiFailure(e,'Chưa đọc được góp ý.',headers);}
}
export async function PUT(req:Request,context:Context){
 if(env.HUB2_ENABLED!=='true')return Response.json({error:'Not found'},{status:404,headers});
 const user=await getHubUser();if(!user)return Response.json({error:'Sign in required'},{status:401,headers});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403,headers});
 try{const text=await req.text();if(text.length>6000)return Response.json({error:'Góp ý quá dài.'},{status:413,headers});return Response.json(await saveReflection(storage(),user.id,(await context.params).id,JSON.parse(text)),{headers});}catch(e){return apiFailure(e,'Chưa lưu được góp ý.',headers);}
}
