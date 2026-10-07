import {applyRun,learningContext,runSchema} from '../../../lib/daily-store';
import {runIdSchema} from '../../../lib/run-schema';
import {apiFailure,ApiError} from '../../../lib/api-error';
// Service authorization is supplied by the existing restricted Sites dispatch
// boundary. Do not expose this route on an independent/public Worker.
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 try{
  const url=new URL(req.url),id=url.searchParams.get('runId');
  if(id&&!runIdSchema.safeParse(id).success)throw new ApiError(400,'runId không hợp lệ.');
  const origin=url.searchParams.get('origin')==='manual'?'manual':'scheduled';
  return Response.json(await learningContext(id??undefined,origin),{headers});
 }catch(e){return apiFailure(e,'Không đọc được ngữ cảnh cập nhật. Hãy thử lại sau.',headers);}
}
export async function POST(req:Request){
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403,headers});
 try{
  const raw=await req.text();
  if(raw.length>300000)throw new ApiError(413,'Payload quá lớn.');
  const parsed=runSchema.safeParse(JSON.parse(raw));
  if(!parsed.success)return Response.json({error:'Dữ liệu bài hoặc runId không hợp lệ.',details:parsed.error.flatten()},{status:400,headers});
  return Response.json(await applyRun(parsed.data),{headers});
 }catch(e){return apiFailure(e,'Không lưu được lượt chạy. Đọc lại với cùng runId trước khi thử lại.',headers);}
}
