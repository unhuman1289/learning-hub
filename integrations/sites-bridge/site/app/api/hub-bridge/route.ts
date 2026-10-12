import { env } from 'cloudflare:workers';
import { authorizeSiteCaller, bridgeCall } from '../../../lib/hub-bridge.mjs';
export const dynamic='force-dynamic';
const bindings=()=>env as unknown as Record<string,string>;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 if(!authorizeSiteCaller(request,bindings()))return reply({error:'Owner access required'},403);
 const url=new URL(request.url);const action=url.searchParams.get('action')??'hub_schema';
 if(!['hub_schema','hub_context','hub_run'].includes(action))return reply({error:'Invalid read operation'},400);
 try{const runId=url.searchParams.get('runId');const result=await bridgeCall(action,runId?{runId}:{},bindings());return reply(result,result.ok?200:result.status);}catch{return reply({error:'Invalid read arguments'},400);}
}
export async function POST(request:Request){
 if(!authorizeSiteCaller(request,bindings()))return reply({error:'Owner access required'},403);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin rejected'},403);
 try{const raw=await request.text();if(raw.length>300000)return reply({error:'Payload too large'},413);const body=JSON.parse(raw);
 if(!['hub_start_run','hub_result'].includes(body.operation))return reply({error:'Invalid write operation'},400);
 const result=await bridgeCall(body.operation,body.arguments,bindings());return reply(result,result.ok?200:result.status);
 }catch{return reply({error:'Invalid write arguments'},400);}
}
