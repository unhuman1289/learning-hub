import type {HubAuthBindings} from '../auth/create';
import {authorizationMetadata,mcpScopes} from './metadata';

export async function discovery(_request:Request,kind:'oauth'|'openid'|'resource',env:HubAuthBindings){
 if(env.MCP_ENABLED!=='true'||env.HUB2_ENABLED!=='true')return Response.json({error:'Not found'},{status:404});
 if(kind==='resource')return Response.json({resource:env.APP_ORIGIN+'/mcp',authorization_servers:[env.APP_ORIGIN+'/api/auth'],scopes_supported:mcpScopes,bearer_methods_supported:['header']},{headers:{'Cache-Control':'no-store'}});
 return Response.json(authorizationMetadata(env.APP_ORIGIN!),{headers:{'Cache-Control':'no-store'}});
}
