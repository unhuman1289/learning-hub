import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import {createLocalJWKSet,jwtVerify} from 'jose';
import {createHubAuth,type HubAuthBindings} from '../auth/create';
import {plannerPrincipal,callPlannerTool,toolSchemas,toolDescriptions} from './service';
import {ApiError} from '../api-error';
import {registerEvents} from './events-register';
import {readBoundedText} from './body';

export async function mcpRequest(request:Request,env:HubAuthBindings){
 if(env.MCP_ENABLED!=='true'||env.HUB2_ENABLED!=='true')return Response.json({error:'Not found'},{status:404});
 const origin=env.APP_ORIGIN!;
 // No caller identity headers or shared automation secrets participate in this boundary.
 const challenge={'WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="hub:plan"`,'Cache-Control':'no-store'};
 const raw=request.headers.get('Authorization')??'';
 if(!/^Bearer [^\s]{1,8192}$/.test(raw))return Response.json({error:'OAuth token required'},{status:401,headers:challenge});
 const auth=createHubAuth(env);await auth.$context;
 let claims;
 try{
  const jwks=await auth.api.getJwks({});
  claims=(await jwtVerify(raw.slice(7),createLocalJWKSet(jwks),{issuer:origin+'/api/auth',audience:origin+'/mcp',algorithms:['EdDSA']})).payload;
  if(claims.cnf)throw Error('Sender-bound token not supported by this endpoint');
 }catch{return Response.json({error:'Invalid OAuth token'},{status:401,headers:challenge});}
 if(typeof claims.scope!=='string'||!claims.scope.split(' ').some(s=>['hub:plan','hub:assess'].includes(s)))return Response.json({error:'Insufficient scope'},{status:403,headers:{...challenge,'WWW-Authenticate':'Bearer error="insufficient_scope", scope="hub:plan"'}});
 const req=request;
  if(typeof claims.sub!=='string'||typeof claims.client_id!=='string')return Response.json({error:'OAuth identity required'},{status:403});
  let principal;try{principal=await plannerPrincipal(env.DB,claims.sub,claims.client_id,claims.scope.split(' '));}catch{return Response.json({error:'Quyền kết nối không còn hiệu lực.'},{status:403});}
  if(req.method==='POST'&&await readBoundedText(req.clone(),512*1024)===null)return Response.json({error:'Payload too large'},{status:413});
  const handler=createMcpHandler(()=>{
   const server=new McpServer({name:'Learning Hub — Cloudflare',version:'1.1.0'});
   registerEvents(server,env,principal,claims.sub as string,claims.client_id as string);
   for(const name of Object.keys(toolSchemas) as (keyof typeof toolSchemas)[]){
    const read=['hub2_schema','hub2_context','hub2_job'].includes(name);
    server.registerTool(name,{description:toolDescriptions[name],inputSchema:toolSchemas[name],annotations:{readOnlyHint:read,destructiveHint:false,idempotentHint:read,openWorldHint:false}},async(args:unknown)=>{
     try{
      const result=await callPlannerTool(env.DB,principal,name,args,env.ENVIRONMENT??'unknown');
      return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result,isError:'status' in result&&result.status===422};
     }catch(e){const status=e instanceof ApiError?e.status:500;return {content:[{type:'text' as const,text:JSON.stringify({status,error:e instanceof ApiError?e.message:'Yêu cầu chưa hoàn tất. Đọc lại cùng job trước khi thử lại.'})}],isError:true};}
    });
   }
   return server;
  },{legacy:'stateless'});
  return handler.fetch(req);

}
