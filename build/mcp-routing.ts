/** Routes served before the framework so OAuth/MCP use the app's canonical origin. */
export function isDirectMcpRoute(request:Request){
 const url=new URL(request.url),p=url.pathname;
 return p==='/mcp'||p.startsWith('/.well-known/')||p==='/connect/chatgpt'||p==='/connections'||p==='/connections/revoke'||p.startsWith('/api/auth/oauth2/')||p==='/api/auth/jwks'||(p==='/login'&&url.searchParams.has('client_id'));
}

/** In profile mode this endpoint is reserved for the signed ChatGPT OAuth login form. */
export function isMcpAccountSignIn(request: Request) {
  return request.method === 'POST' && new URL(request.url).pathname === '/api/auth/sign-in/email';
}
