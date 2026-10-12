import { getHubUser } from '../../../lib/auth/session';
import {apiFailure} from '../../../lib/api-error';
import { storage } from '../../../db/storage';
import { resolveLearner } from '../../../lib/access';
function validData(d:unknown):boolean {
 if(!d||typeof d!=='object')return false;const x=d as Record<string,unknown>;
 const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object';
 const isText=(v:unknown):v is string=>typeof v==='string';
 if(!Array.isArray(x.done)||!x.done.every(isText)||!Array.isArray(x.notes)||!Array.isArray(x.logs)||!x.starts||typeof x.starts!=='object'||!Object.values(x.starts).every(isText))return false;
 if(!x.notes.every((n:unknown)=>isRecord(n)&&isText(n.id)&&isText(n.title)&&isText(n.track)&&isText(n.body)&&isText(n.url)&&(!n.url||/^https?:\/\//.test(n.url))))return false;
 if(!x.logs.every((l:unknown)=>isRecord(l)&&isText(l.id)&&isText(l.kind)&&isText(l.track)&&isText(l.body)&&isText(l.date)&&Number.isFinite(Date.parse(l.date))&&(!l.due||typeof l.due==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(l.due))&&(l.minutes===undefined||typeof l.minutes==='number'&&Number.isInteger(l.minutes)&&l.minutes>0&&l.minutes<=1440)))return false;
 return true;
}
// Each account has its own workspace (docs/hub2 D15). Guardians and admins may read a learner's
// workspace with ?learner=; only the learner writes it.
async function ensureWorkspace(db:ReturnType<typeof storage>,owner:string){
 await db.prepare('INSERT OR IGNORE INTO learning_workspace (owner,payload,revision,updated) VALUES (?,?,0,?)').bind(owner,'null',new Date().toISOString()).run();
}
export async function GET(req:Request) {
 const u=await getHubUser(); if(!u) return Response.json({error:'Sign in required'},{status:401});
 try {
  const db=storage();
  const owner=await resolveLearner(db,u,req,'read_work');
  if(owner instanceof Response)return owner;
  if(owner===u.id)await ensureWorkspace(db,owner);
  const row=await db.prepare('SELECT payload, revision FROM learning_workspace WHERE owner = ?').bind(owner).first<{payload:string,revision:number}>();
  return Response.json(row?{data:JSON.parse(row.payload),revision:row.revision}:{data:null,revision:0},{headers:{'Cache-Control':'private, no-store'}});
 } catch(e){return apiFailure(e,'Không tải được ghi chú. Hãy thử lại.');}
}
export async function PUT(req:Request) {
 const u=await getHubUser(); if(!u)return Response.json({error:'Sign in required'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403});
 try {const body=await req.json() as {revision:number,data:{notes:unknown[],logs:unknown[],done:unknown[]}};if(!body||typeof body!=='object'||!Number.isInteger(body.revision)||body.revision<0||!validData(body.data)||JSON.stringify(body.data).length>500000)return Response.json({error:'Dữ liệu không hợp lệ hoặc quá lớn.'},{status:400});
 const db=storage();
 await ensureWorkspace(db,u.id);
 const result=await db.prepare('UPDATE learning_workspace SET payload = ?, revision = revision + 1, updated = ? WHERE owner = ? AND revision = ?').bind(JSON.stringify(body.data),new Date().toISOString(),u.id,body.revision).run();
 if(!result.meta.changes)return Response.json({error:'Dữ liệu đã thay đổi trên thiết bị khác. Xuất bản nháp trước khi tải lại.'},{status:409});return Response.json({revision:body.revision+1});
 }catch(e){return apiFailure(e,'Chưa lưu được. Bản nháp vẫn ở trang này.');}
}
