import {createHubAuth,type HubAuthBindings} from '../lib/auth/create';
import {verifyOAuthQueryParams} from '@better-auth/oauth-provider';
import {mcpRequest} from '../lib/mcp/http';
import {discovery} from '../lib/mcp/discovery';
import {escapeHtml} from '../lib/auth/email';
import {allowedRegistration} from '../lib/mcp/policy';
import {sha256Hex} from '../lib/auth/automation';
import {deliverEvents} from '../lib/mcp/events';
import {readBoundedText} from '../lib/mcp/body';
import {WorkerEntrypoint} from 'cloudflare:workers';

// Private RPC service binding only; no public HTTP route or caller credentials.
export class EventDispatcher extends WorkerEntrypoint<HubAuthBindings>{
 async dispatch(jobId:string){
  if(!/^job_[a-z0-9]{20}$/.test(jobId))throw new Error('Invalid job ID');
  return deliverEvents(this.env,new Date(),fetch,jobId);
 }
}

function html(title:string,body:string,script=''){
 return new Response(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:17px/1.6 system-ui;background:#f2eff0;color:#343136;margin:0}main{max-width:560px;margin:8vh auto;padding:28px;background:#fff;border:1px solid #d9cdd2}label,input{display:block}input{box-sizing:border-box;width:100%;padding:12px;margin:4px 0 18px;border:1px solid #9b8991}button{padding:12px 20px;border:1px solid #82566a;background:#ecd9e2;color:#343136;cursor:pointer;margin:12px 8px 0 0}button:focus-visible,input:focus-visible{outline:3px solid #82566a;outline-offset:3px}button:disabled{opacity:.5}#error{color:#9a314f}p,code{overflow-wrap:anywhere}@media(max-width:600px){main{margin:20px 12px;padding:20px}}</style><main>${body}</main>${script?'<script>'+script+'</script>':''}</html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"}});
}
const queryValue=(query:string)=>JSON.stringify(query).replaceAll('<','\\u003c');
export default {scheduled(controller:ScheduledController,env:HubAuthBindings,ctx:ExecutionContext){console.info(JSON.stringify({component:'mcp-events',operation:'dispatch',phase:'scheduled_started'}));ctx.waitUntil(deliverEvents(env,new Date(controller.scheduledTime)).then(r=>console.info(JSON.stringify({component:'mcp-events',operation:'dispatch',phase:'scheduled_finished',delivered:r.delivered}))));},async fetch(request:Request,env:HubAuthBindings,oauthLoginOnly=false){
 try{
  if(env.MCP_ENABLED!=='true'||env.HUB2_ENABLED!=='true')return Response.json({error:'Not found'},{status:404});
  const url=new URL(request.url),path=url.pathname;
  if(path==='/mcp')return await mcpRequest(request,env);
  if(request.method==='GET'&&path.startsWith('/.well-known/')){
   const kind=path==='/'+'.well-known/oauth-authorization-server/api/auth'?'oauth':path==='/'+'.well-known/openid-configuration/api/auth'?'openid':['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(path)?'resource':null;
   if(kind)return discovery(request,kind,env);
  }
  if(path.startsWith('/api/auth/')){
   // Only the login/session, OAuth, and public-key surfaces are exposed here.
   if(!['/api/auth/oauth2/authorize','/api/auth/oauth2/token','/api/auth/oauth2/register','/api/auth/oauth2/consent','/api/auth/oauth2/userinfo','/api/auth/oauth2/revoke','/api/auth/sign-in/email','/api/auth/sign-out','/api/auth/get-session','/api/auth/jwks'].includes(path))return Response.json({error:'Not found'},{status:404});
   if (oauthLoginOnly && path === '/api/auth/sign-in/email') {
    const reject = () => Response.json({error:'Kết nối OAuth không hợp lệ.'},{status:400,headers:{'Cache-Control':'no-store'}});
    if (request.method !== 'POST' || request.headers.get('Origin') !== env.APP_ORIGIN ||
        !request.headers.get('Content-Type')?.startsWith('application/json')) return reject();
    const text = await readBoundedText(request.clone(), 16384);
    if (text === null) return reject();
    let query: unknown;
    try { query = JSON.parse(text)?.oauth_query; } catch { return reject(); }
    const auth = createHubAuth(env);
    if (typeof query !== 'string' || !await verifyOAuthQueryParams(query,(await auth.$context).secret)) return reject();
    return await auth.handler(request);
   }
   if(path==='/api/auth/oauth2/register'&&request.method==='POST'){
    const text=await readBoundedText(request.clone(),16384);if(text===null)return Response.json({error:'invalid_client_metadata'},{status:413});
    let body;try{body=JSON.parse(text);}catch{return Response.json({error:'invalid_client_metadata'},{status:400});}
    if(!allowedRegistration(body))return Response.json({error:'invalid_client_metadata'},{status:400});
   }
   return await createHubAuth(env).handler(request);
  }
  if(path==='/connections'||path==='/connections/revoke'){
   const auth=createHubAuth(env),session=await auth.api.getSession({headers:request.headers});
   if(!session?.user||session.user.status!=='active')return html('Chưa đăng nhập','<h1>Chưa đăng nhập</h1><p>Bắt đầu kết nối từ ChatGPT để đăng nhập.</p>');
   const owner=session.user.id;
   if(path==='/connections/revoke'&&request.method==='POST'){
    if(request.headers.get('Origin')!==env.APP_ORIGIN)return Response.json({error:'Origin required'},{status:403});
    const text=await readBoundedText(request,4096);if(text===null)return Response.json({error:'Request too large'},{status:413});
    if(!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))return Response.json({error:'Invalid request'},{status:400});
    const form=new URLSearchParams(text),id=form.get('id');if(typeof id!=='string'||id.length>128)return Response.json({error:'Invalid request'},{status:400});
    const row=await env.DB.prepare('SELECT clientId FROM oauthConsent WHERE id=? AND userId=?').bind(id,owner).first<{clientId:string}>();if(!row)return Response.json({error:'Not found'},{status:404});
    const leaseClient='mcp_'+(await sha256Hex(row.clientId+':'+owner)).slice(0,20),now=Date.now();
    await env.DB.batch([
     env.DB.prepare('UPDATE oauthRefreshToken SET revoked=? WHERE userId=? AND clientId=?').bind(now,owner,row.clientId),
     env.DB.prepare('UPDATE oauthAccessToken SET revoked=? WHERE userId=? AND clientId=?').bind(now,owner,row.clientId),
     env.DB.prepare("UPDATE ai_jobs SET status='cancelled',lease_token_sha256=NULL,lease_expires_at=NULL,apply_token=NULL WHERE learner_id=? AND lease_client_id=? AND status='leased'").bind(owner,leaseClient),
     env.DB.prepare('DELETE FROM oauthConsent WHERE userId=? AND clientId=?').bind(owner,row.clientId),
    ]);
    return Response.redirect(env.APP_ORIGIN+'/connections',303);
   }
   if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
   const {results:rows=[]}=await env.DB.prepare('SELECT c.id,a.name FROM oauthConsent c JOIN oauthClient a ON a.clientId=c.clientId WHERE c.userId=?').bind(owner).all<{id:string;name:string|null}>();
   return html('Kết nối của bạn','<h1>Kết nối của bạn</h1><p>Thu hồi sẽ dừng quyền soạn bài và hủy lease đang giữ. Bài đã lưu và lịch sử học được giữ nguyên.</p>'+rows.map(r=>`<form action="/connections/revoke" method="post"><p>${escapeHtml(r.name??'Ứng dụng OAuth')}</p><input type="hidden" name="id" value="${escapeHtml(r.id)}"><button>Thu hồi quyền</button></form>`).join('')+(rows.length?'':'<p>Không có kết nối đang được cấp quyền.</p>'));
  }
  if(path==='/login'&&request.method==='GET'){
   const q=url.search.slice(1),auth=createHubAuth(env);if(!await verifyOAuthQueryParams(q,(await auth.$context).secret))return html('Kết nối chưa hợp lệ','<h1>Kết nối chưa hợp lệ</h1><p>Hãy bắt đầu từ mục tạo MCP trong ChatGPT.</p>');
   return html('Đăng nhập Learning Hub','<h1>Đăng nhập Learning Hub</h1><p>Đăng nhập bằng tài khoản Hub đã được duyệt. Mật khẩu được gửi tới Cloudflare của bạn, không gửi vào ChatGPT.</p><form id="login"><label>Email<input id="email" type="email" autocomplete="username" required></label><label>Mật khẩu<input id="password" type="password" autocomplete="current-password" required></label><p id="error" role="alert"></p><button id="submit">Đăng nhập</button></form>',`document.getElementById('login').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('submit');b.disabled=true;try{const r=await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value,oauth_query:${queryValue(q)}})});const data=await r.json();if(!r.ok||!data.url)throw Error('Chưa đăng nhập được. Kiểm tra tài khoản đã xác minh và được duyệt.');const u=new URL(data.url,location.origin);if(u.origin!==location.origin||u.pathname!=='/connect/chatgpt')throw Error('Chưa xác nhận bước cấp quyền.');location.assign(u.href);}catch(e){document.getElementById('error').textContent=e.message;b.disabled=false;}}`);
  }
  if(path==='/connect/chatgpt'&&request.method==='GET'){
   const auth=createHubAuth(env),q=url.search.slice(1);if(!await verifyOAuthQueryParams(q,(await auth.$context).secret))return html('Kết nối chưa hợp lệ','<h1>Kết nối đã hết hạn hoặc bị sửa.</h1>');
   const session=await auth.api.getSession({headers:request.headers});if(!session?.user||session.user.status!=='active')return html('Chưa đăng nhập','<h1>Quay lại ChatGPT để đăng nhập và kết nối lại.</h1>');
   const knowledge = (url.searchParams.get('scope')??'').split(' ').includes('hub:knowledge');
   if(knowledge){
    const child = await env.DB.prepare("SELECT role FROM learner_settings WHERE user_id=?").bind(session.user.id).first<{role:string}>();
    if(session.user.role!=='admin'||child?.role==='child')return html('Cần quyền quản trị','<h1>Chỉ quản trị viên có thể cấp quyền bảo trì tri thức.</h1>');
   }
   return html('Cấp quyền ChatGPT',`<h1>Kết nối ChatGPT với Learning Hub</h1><p>Tài khoản: ${escapeHtml(session.user.name)}.</p>${env.ENVIRONMENT==='production'?'':'<p>Cho phép ChatGPT đọc ngữ cảnh, soạn và lưu bài của chính tài khoản này khi cấp hub:plan. Nếu cấp thêm hub:assess, ChatGPT được đọc câu trả lời và lưu điểm/lời phê cho Deutsch của unhuman (pilot câu chữ). Không cấp quyền xem người khác, chấm bài trẻ/y khoa, duyệt tài khoản hoặc tự hoàn thành bài.</p>'}${knowledge?'<p>Quyền hub:knowledge cho phép bảo trì nguồn công khai, kích hoạt và khôi phục phiên bản tri thức. Quyền này độc lập với quyền soạn và chấm.</p>':''}<p>Quyền có thể được dùng khi bạn không mở Hub. Access token hết hạn sau 15 phút; refresh token duy trì kết nối.</p><p><a href="/connections">Xem và thu hồi các kết nối</a></p><details><summary>Chi tiết</summary><p>Quay về: ${escapeHtml(url.searchParams.get('redirect_uri')??'')}</p><p>Quyền: ${escapeHtml(url.searchParams.get('scope')??'')}</p></details><p id="error" role="alert"></p><button id="accept">Cho phép kết nối</button><button id="deny">Từ chối</button>`,`async function decide(accept){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{const r=await fetch('/api/auth/oauth2/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accept,oauth_query:${queryValue(q)}})});const d=await r.json();if(!r.ok||!(d.redirect_uri||d.url))throw Error('Chưa xác nhận cấp quyền.');const u=new URL(d.redirect_uri||d.url);if(u.protocol!=='https:'||u.hostname!=='chatgpt.com')throw Error('Địa chỉ quay về không hợp lệ.');location.assign(u.href);}catch(e){document.getElementById('error').textContent=e.message;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}document.getElementById('accept').onclick=()=>decide(true);document.getElementById('deny').onclick=()=>decide(false);`);
  }
  return Response.json({error:'Not found'},{status:404});
 }catch{return Response.json({error:'Yêu cầu chưa hoàn tất. Không gửi lại dữ liệu ghi nếu chưa kiểm tra cùng job.'},{status:500,headers:{'Cache-Control':'no-store'}});}
}};
