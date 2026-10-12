import { env } from 'cloudflare:workers';
import { authorizeSiteCaller, bridgeCall, tools } from '../../lib/hub-bridge.mjs';
export const dynamic='force-dynamic';
const bindings=()=>env as unknown as Record<string,string>;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){
 if(!authorizeSiteCaller(request,bindings()))return reply({error:'Owner access required'},403);
 if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin rejected'},403);
 let id:unknown=null;
 try {
  const raw=await request.text();if(raw.length>300000)return reply({error:'Payload too large'},413);
  const rpc=JSON.parse(raw);id=rpc.id??null;
  if(rpc.jsonrpc!=='2.0')throw Error('Invalid JSON-RPC');
  if(rpc.method==='server/discover')return reply({jsonrpc:'2.0',id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}}}});
  if(rpc.method==='tools/list')return reply({jsonrpc:'2.0',id,result:{tools}});
  if(rpc.method!=='tools/call'||!tools.some((t:{name:string})=>t.name===rpc.params?.name))return reply({jsonrpc:'2.0',id,error:{code:-32601,message:'Unknown method or tool'}});
  const result=await bridgeCall(rpc.params.name,rpc.params.arguments??{},bindings());
  return reply({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],isError:!result.ok}});
 }catch{return reply({jsonrpc:'2.0',id,error:{code:-32602,message:'Invalid request'}});}
}
