import {mcpScopes} from './metadata';
import {knowledgePrincipal,knowledgeTools,callKnowledgeTool} from '../knowledge/tools';
import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import {createLocalJWKSet,jwtVerify} from 'jose';
import {createHubAuth,type HubAuthBindings} from '../auth/create';
import {ApiError} from '../api-error';
import {readBoundedText} from './body';

export async function mcpRequest(request:Request,env:HubAuthBindings){
 if(env.MCP_ENABLED!=='true'||env.HUB2_ENABLED!=='true')return Response.json({error:'Not found'},{status:404});
 const origin=env.APP_ORIGIN!;
 const allowedScopes=mcpScopes.filter(scope=>scope.startsWith('hub:'));
 const advertisedScope='hub:knowledge';
 // No caller identity headers or shared automation secrets participate in this boundary.
 const challenge={'WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="${advertisedScope}"`,'Cache-Control':'no-store'};
 const raw=request.headers.get('Authorization')??'';
 if(!/^Bearer [^\s]{1,8192}$/.test(raw))return Response.json({error:'OAuth token required'},{status:401,headers:challenge});
 const auth=createHubAuth(env);await auth.$context;
 let claims;
 try{
  const jwks=await auth.api.getJwks({});
  claims=(await jwtVerify(raw.slice(7),createLocalJWKSet(jwks),{issuer:origin+'/api/auth',audience:origin+'/mcp',algorithms:['EdDSA']})).payload;
  if(claims.cnf)throw Error('Sender-bound token not supported by this endpoint');
 }catch{return Response.json({error:'Invalid OAuth token'},{status:401,headers:challenge});}
 if(typeof claims.scope!=='string'||!claims.scope.split(' ').some(s=>allowedScopes.includes(s)))return Response.json({error:'Insufficient scope'},{status:403,headers:{...challenge,'WWW-Authenticate':`Bearer error="insufficient_scope", scope="${advertisedScope}"`}});
 const req=request;
  if(typeof claims.sub!=='string'||typeof claims.client_id!=='string')return Response.json({error:'OAuth identity required'},{status:403});
  const scopes=claims.scope.split(' ').filter(scope=>allowedScopes.includes(scope));
  const knowledge=await knowledgePrincipal(env.DB,claims.sub,claims.client_id,scopes).catch(()=>null);
  if(!knowledge)return Response.json({error:'Quyền kết nối không còn hiệu lực.'},{status:403});
  if(req.method==='POST'&&await readBoundedText(req.clone(),512*1024)===null)return Response.json({error:'Payload too large'},{status:413});
  const handler=createMcpHandler(()=>{
   const server=new McpServer({name:'Learning Hub — Cloudflare',version:'1.1.0'});
   for(const name of Object.keys(knowledgeTools) as (keyof typeof knowledgeTools)[]){
    const {schema,description,read}=knowledgeTools[name];
    server.registerTool('hub2_kb_'+name,{description,inputSchema:schema,annotations:{readOnlyHint:read,destructiveHint:!read,idempotentHint:read,openWorldHint:false}},async(args:unknown)=>{
     try {
      const result=await callKnowledgeTool(env.DB,knowledge,name,args);
      return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result};
     } catch(error) {
      const result={status:error instanceof ApiError?error.status:500,error:error instanceof ApiError?error.message:'Đọc lại lịch sử trước khi thử lại.'};
      return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result,isError:true};
     }
    });
   }
   return server;
  },{legacy:'stateless'});
  return handler.fetch(req);

}
