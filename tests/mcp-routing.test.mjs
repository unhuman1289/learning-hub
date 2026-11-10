import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDirectMcpRoute} from '../build/mcp-routing.ts';
import {eventsEnabled} from '../lib/mcp/events.ts';
test('same-origin MCP routes leave normal app login and registration with framework',()=>{
 for(const p of ['/mcp','/.well-known/oauth-protected-resource/mcp','/connect/chatgpt','/connections','/connections/revoke','/api/auth/oauth2/register','/api/auth/jwks','/login?client_id=chatgpt'])assert(isDirectMcpRoute(new Request('https://learn.unhuman.cc'+p)));
 for(const p of ['/','/login','/register','/forgot-password','/api/auth/sign-up/email','/api/auth/sign-in/email','/api/admin/ai-jobs'])assert(!isDirectMcpRoute(new Request('https://learn.unhuman.cc'+p)));
});
test('production events require explicit switch; local never emits',()=>{
 assert(eventsEnabled({ENVIRONMENT:'production',MCP_EVENTS_ENABLED:'true'}));
 assert(!eventsEnabled({ENVIRONMENT:'production'}));assert(!eventsEnabled({ENVIRONMENT:'local',MCP_EVENTS_ENABLED:'true'}));
});
