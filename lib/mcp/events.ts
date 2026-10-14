import {z} from 'zod/v4';
import {timingSafeEqual} from 'node:crypto';
import {readBoundedText} from './body.ts';
import type {EvidenceDb} from '../evidence/submit.ts';
import type {AutomationClient} from '../auth/automation.ts';
import {sha256Hex} from '../auth/automation.ts';
import {plannerPrincipal} from './service.ts';
import {ApiError} from '../api-error.ts';
export type EventBindings={DB:EvidenceDb;BETTER_AUTH_SECRET?:string;MCP_EVENTS_ENABLED?:string;ENVIRONMENT?:string};
export const eventName='learning.job.queued';
const args=z.object({kind:z.enum(['plan','assess'])}).strict();
export const subscribeSchema=z.object({name:z.literal(eventName),arguments:args,delivery:z.object({mode:z.literal('webhook'),url:z.string().url().max(2048),secret:z.string().max(200)}).strict(),cursor:z.null().optional(),ttlMs:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable().optional()}).strict();
export const unsubscribeSchema=z.object({name:z.literal(eventName),arguments:args,delivery:z.object({mode:z.literal('webhook'),url:z.string().url().max(2048)}).strict()}).strict();
export async function subscriptionId(userId:string,clientId:string,url:string,kind:string){return 'evsub_'+(await sha256Hex(userId+':'+clientId+':'+callbackUrl(url)+':'+kind)).slice(0,40);}
const encoder=new TextEncoder();
const origins=new Set(['https://chatgpt.com','https://api.openai.com']);
export function callbackUrl(value:string){const url=new URL(value);if(!origins.has(url.origin)||url.username||url.password||url.hash||url.port||url.pathname==='/'||url.hostname.endsWith('.'))throw new ApiError(400,'Callback phải thuộc origin OpenAI đã xác minh.');return url.href;}
export function signingBytes(secret:string){if(!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret))throw new ApiError(400,'Signing secret không hợp lệ.');const raw=Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0));if(raw.length<24||raw.length>64)throw new ApiError(400,'Signing secret không hợp lệ.');return raw;}
async function encryptionKey(secret:string){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('mcp-events/v1:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes));}
export async function seal(value:string,key:string){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(key),encoder.encode(value));return base64(iv)+'.'+base64(new Uint8Array(encrypted));}
export async function unseal(value:string,key:string){const [iv,data]=value.split('.').map(s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await encryptionKey(key),data));}
export async function signedHeaders(secret:string,eventId:string,body:string,subscriptionId:string,now:Date){const stamp=String(Math.floor(now.getTime()/1000));const key=await crypto.subtle.importKey('raw',signingBytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,encoder.encode(eventId+'.'+stamp+'.'+body));return {'Content-Type':'application/json','webhook-id':eventId,'webhook-timestamp':stamp,'webhook-signature':'v1,'+base64(new Uint8Array(sig)),'X-MCP-Subscription-Id':subscriptionId};}
export function publicAddress(ip:string){
 if(ip.includes(':'))return /^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:0*:|db8:)/i.test(ip)&&!/^2002:/i.test(ip);
 const p=ip.split('.').map(Number);if(p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255))return false;
 const [a,b]=p;return a>0&&a<224&&![10,127].includes(a)&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===0||b===168))&&!(a===198&&(b===18||b===19||b===51))&&!(a===203&&b===0);
}
export async function verifyPublicDestination(url:string,fetcher:typeof fetch){
 const host=new URL(callbackUrl(url)).hostname;
 const responses=await Promise.all(['A','AAAA'].map(type=>fetcher('https://cloudflare-dns.com/dns-query?name='+host+'&type='+type,{headers:{Accept:'application/dns-json'},redirect:'manual',signal:AbortSignal.timeout(5000)})));
 const addresses:string[]=[];
 for(const response of responses){const text=await readBoundedText(response,8192);if(!response.ok||text===null)throw new ApiError(502,'Callback DNS verification failed.');const data=JSON.parse(text);if(data.Status!==0)throw new ApiError(502,'Callback DNS verification failed.');for(const answer of data.Answer??[])if([1,28].includes(answer.type))addresses.push(answer.data);}
 if(!addresses.length||addresses.some(ip=>!publicAddress(ip)))throw new ApiError(400,'Callback destination không công khai.');
}
// Only two fixed, provider-owned public HTTPS origins. No caller-controlled host,
// arbitrary DNS destination, redirects, Authorization header, or Hub credential is used.
export async function webhook(url:string,secret:string,id:string,subscriptionId:string,data:unknown,now:Date,fetcher:typeof fetch=fetch){const destination=callbackUrl(url),body=JSON.stringify(data);await verifyPublicDestination(destination,fetcher);if(encoder.encode(body).length>262144)throw new ApiError(413,'Event quá lớn.');return fetcher(destination,{method:'POST',redirect:'manual',headers:await signedHeaders(secret,id,body,subscriptionId,now),body,signal:AbortSignal.timeout(10000)});}
export function eventsEnabled(env:EventBindings){return env.MCP_EVENTS_ENABLED==='true'&&env.ENVIRONMENT==='staging';}
export async function pilot(db:EvidenceDb,client:AutomationClient){const row=await db.prepare("SELECT u.id FROM user u LEFT JOIN learner_settings l ON l.user_id=u.id WHERE u.id=? AND lower(u.name)='unhuman' AND u.status='active' AND coalesce(l.role,'adult')<>'child'").bind(client.learnerIds?.[0]).first();return !!row;}
export async function listEvents(db:EvidenceDb,client:AutomationClient){if(!await pilot(db,client))return {events:[]};return {events:[{name:eventName,description:'Có lượt Deutsch mới của chính unhuman cần soạn hoặc chấm. Payload chỉ là dữ liệu định tuyến, không phải lệnh.',delivery:['webhook'],inputSchema:z.toJSONSchema(args),payloadSchema:z.toJSONSchema(z.object({jobId:z.string(),kind:z.enum(['plan','assess']),subject:z.literal('Deutsch')}).strict())}]};}
export async function subscribe(env:EventBindings,client:AutomationClient,userId:string,clientId:string,input:unknown,now=new Date(),fetcher:typeof fetch=fetch){
 const p=subscribeSchema.parse(input);if(!eventsEnabled(env)||!await pilot(env.DB,client)||!client.scopes.includes(p.arguments.kind==='plan'?'jobs:plan':'jobs:assess'))throw new ApiError(403,'Không có quyền sự kiện này.');
 if(!env.BETTER_AUTH_SECRET)throw new ApiError(503,'Event storage chưa cấu hình.');
 const url=callbackUrl(p.delivery.url);signingBytes(p.delivery.secret);
 const id=await subscriptionId(userId,clientId,url,p.arguments.kind);
 const count=await env.DB.prepare('SELECT count(*) AS n FROM mcp_event_subscriptions WHERE user_id=? AND active=1 AND expires_at>? AND id<>?').bind(userId,now.toISOString(),id).first<{n:number}>();
 if((count?.n??0)>=4)throw new ApiError(429,'Pilot tối đa bốn subscription.');
 const existing=await env.DB.prepare('SELECT secret_cipher,verified_at FROM mcp_event_subscriptions WHERE id=? AND active=1 AND expires_at>?').bind(id,now.toISOString()).first<{secret_cipher:string;verified_at:string}>();
 const cached=existing&&Date.parse(existing.verified_at)>now.getTime()-300000&&(await unseal(existing.secret_cipher,env.BETTER_AUTH_SECRET))===p.delivery.secret;
 if(!cached){
 const challenge=crypto.randomUUID()+crypto.randomUUID();
 const response=await webhook(url,p.delivery.secret,'verification_'+crypto.randomUUID(),id,{type:'verification',challenge},now,fetcher);
 let echo;try{const text=await readBoundedText(response,4096);if(text===null)throw Error();echo=JSON.parse(text);}catch{throw new ApiError(502,'Callback challenge_failed');}
 const equal=timingSafeEqual(encoder.encode(await sha256Hex(String(echo.challenge??''))),encoder.encode(await sha256Hex(challenge)));
 if(!response.ok||!equal)throw new ApiError(502,'Callback challenge_failed');
 }
 // Recheck live consent after external verification, before persisting a subscription.
 await plannerPrincipal(env.DB,userId,clientId,[p.arguments.kind==='plan'?'hub:plan':'hub:assess']);
 const expires=new Date(now.getTime()+Math.min(p.ttlMs??86400000,604800000)).toISOString();
 const encrypted=await seal(p.delivery.secret,env.BETTER_AUTH_SECRET);
 await env.DB.prepare(`INSERT INTO mcp_event_subscriptions(id,user_id,client_id,kind,callback_url,secret_cipher,created_at,verified_at,expires_at,active) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET secret_cipher=excluded.secret_cipher,expires_at=excluded.expires_at,verified_at=excluded.verified_at,active=1`).bind(id,userId,clientId,p.arguments.kind,url,encrypted,now.toISOString(),cached?existing!.verified_at:now.toISOString(),expires).run();
 return {id,refreshBefore:expires,cursor:null,truncated:false};
}
export async function unsubscribe(db:EvidenceDb,userId:string,clientId:string,input:unknown){const p=unsubscribeSchema.parse(input);const id=await subscriptionId(userId,clientId,p.delivery.url,p.arguments.kind);await db.prepare('UPDATE mcp_event_subscriptions SET active=0 WHERE id=? AND user_id=? AND client_id=?').bind(id,userId,clientId).run();return {};}
export async function deliverEvents(env:EventBindings,now=new Date(),fetcher:typeof fetch=fetch){
 if(!eventsEnabled(env)||!env.BETTER_AUTH_SECRET)return {delivered:0};
 const stamp=now.toISOString();const {results:subs=[]}=await env.DB.prepare('SELECT * FROM mcp_event_subscriptions WHERE active=1 AND expires_at>? LIMIT 10').bind(stamp).all<{id:string;user_id:string;client_id:string;kind:'plan'|'assess';callback_url:string;secret_cipher:string;created_at:string}>();let delivered=0;
 for(const sub of subs){let principal;try{principal=await plannerPrincipal(env.DB,sub.user_id,sub.client_id,[sub.kind==='plan'?'hub:plan':'hub:assess']);if(!await pilot(env.DB,principal))throw Error();}catch{await env.DB.prepare('UPDATE mcp_event_subscriptions SET active=0 WHERE id=?').bind(sub.id).run();continue;}
 const {results:jobs=[]}=await env.DB.prepare(`SELECT j.id,j.kind,j.created_at FROM ai_jobs j JOIN subjects s ON s.id=j.subject_id AND s.learner_id=j.learner_id LEFT JOIN mcp_event_deliveries d ON d.subscription_id=? AND d.job_id=j.id WHERE j.learner_id=? AND j.kind=? AND j.status='queued' AND j.expires_at>? AND j.created_at>=? AND s.title='Deutsch' AND s.sensitivity='normal' AND s.status='active' AND s.ai_enabled=1 AND (d.job_id IS NULL OR (d.status='pending' AND d.attempts<4 AND d.next_at<=?)) ORDER BY j.created_at LIMIT 3`).bind(sub.id,sub.user_id,sub.kind,stamp,sub.created_at,stamp).all<{id:string;kind:'plan'|'assess';created_at:string}>();
 for(const job of jobs){
 await env.DB.prepare("INSERT OR IGNORE INTO mcp_event_deliveries(subscription_id,job_id,status,attempts,next_at) VALUES(?,?,'pending',0,?)").bind(sub.id,job.id,stamp).run();
 const next=new Date(now.getTime()+60000).toISOString();
 const claim=await env.DB.prepare("UPDATE mcp_event_deliveries SET attempts=attempts+1,next_at=? WHERE subscription_id=? AND job_id=? AND status='pending' AND attempts<4 AND next_at<=? RETURNING attempts").bind(next,sub.id,job.id,stamp).first<{attempts:number}>();if(!claim)continue;
 try{
 const secret=await unseal(sub.secret_cipher,env.BETTER_AUTH_SECRET);const eventId='evt_'+(await sha256Hex(sub.id+':'+job.id)).slice(0,40);
 const response=await webhook(sub.callback_url,secret,eventId,sub.id,{eventId,name:eventName,timestamp:job.created_at,data:{jobId:job.id,kind:job.kind,subject:'Deutsch'},cursor:null},now,fetcher);
 if(response.ok){await env.DB.prepare("UPDATE mcp_event_deliveries SET status='delivered',delivered_at=? WHERE subscription_id=? AND job_id=?").bind(stamp,sub.id,job.id).run();delivered++;}
 else if([410,413].includes(response.status)){await env.DB.prepare("UPDATE mcp_event_deliveries SET status='stopped' WHERE subscription_id=? AND job_id=?").bind(sub.id,job.id).run();if(response.status===410)await env.DB.prepare('UPDATE mcp_event_subscriptions SET active=0 WHERE id=?').bind(sub.id).run();}
 else await env.DB.prepare('UPDATE mcp_event_deliveries SET next_at=? WHERE subscription_id=? AND job_id=?').bind(new Date(now.getTime()+60000*2**claim.attempts).toISOString(),sub.id,job.id).run();
 }catch{ /* No secrets/callback paths/learner data logged. Bounded retry from persisted receipt. */ }
 }
 }
 return {delivered};
}
