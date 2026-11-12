import { z } from 'zod';
import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure } from '../../../../lib/api-error';
import { history, inventory, listGaps, recordGap } from '../../../../lib/knowledge/service';
import { callKnowledgeTool } from '../../../../lib/knowledge/tools';
import { identifier, parse, text } from '../../../../lib/knowledge/policy';

const headers = {'Cache-Control':'private, no-store'};
const commands = z.discriminatedUnion('action', [
  z.strictObject({action:z.literal('rollback'),toSeq:z.number().int().positive(),reason:text(300)}),
  z.strictObject({action:z.literal('wont_fix'),gapId:identifier,note:text(300),clientChangeId:identifier}),
  z.strictObject({action:z.literal('gap'),subjectId:identifier,question:text(300),why:text(300),priority:z.enum(['normal','high'])}),
]);
export const dynamic = 'force-dynamic';

export async function GET() {
  const user=await getHubUser();
  if(user?.role!=='admin'||user.learnerRole==='child')return Response.json({error:'Cần quyền quản trị.'},{status:403,headers});
  try {
    const db=storage();
    const [summary,log,gaps]=await Promise.all([inventory(db),history(db,100),listGaps(db,'open',30)]);
    const since=new Date(Date.now()-7*86400000).toISOString();
    const {results:weekly=[]}=await db.prepare(`SELECT action,count(*) AS count FROM knowledge_changes
      WHERE created_at>=? GROUP BY action`).bind(since).all();
    return Response.json({summary,log,gaps,weekly},{headers});
  } catch(error) {return apiFailure(error,'Chưa mở được mục Tri thức.',headers);}
}

export async function POST(req:Request) {
  const user=await getHubUser();
  if(user?.role!=='admin'||user.learnerRole==='child'||req.headers.get('origin')!==new URL(req.url).origin)
    return Response.json({error:'Cần quyền quản trị.'},{status:403,headers});
  try {
    const input=parse(commands,await req.json());
    const db=storage(), client={clientId:'admin:'+user.id};
    if(input.action==='gap')return Response.json(await recordGap(db,{...input,origin:'admin'}),{headers});
    if(input.action==='rollback')return Response.json(await callKnowledgeTool(db,client,'rollback',{toSeq:input.toSeq,reason:input.reason}),{headers});
    return Response.json(await callKnowledgeTool(db,client,'resolve_gap',{
      gapId:input.gapId,status:'wont_fix',note:input.note,clientChangeId:input.clientChangeId,
    }),{headers});
  } catch(error) {return apiFailure(error,'Chưa lưu được thay đổi tri thức.',headers);}
}
