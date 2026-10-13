import type {EvidenceDb} from './evidence/submit.ts';
import {berlinDay} from './daily-policy.ts';
import {sendAuthEmail,type ResendBindings} from './auth/email.ts';
import {sha256Hex} from './auth/automation.ts';
export type AlertBindings=ResendBindings&{AI_COST_ALERT_USD?:string;ENVIRONMENT?:string};
export async function collectAlerts(db:EvidenceDb,bindings:AlertBindings,now=new Date()){
 const day=berlinDay(now),conditions:{code:string;message:string}[]=[];
 const hour=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(now);
 if(hour>='06'){
  const rows=await db.prepare("SELECT count(*) AS n FROM user u WHERE u.status='active' AND EXISTS(SELECT 1 FROM subjects s WHERE s.learner_id=u.id AND s.status='active' AND s.ai_enabled=1) AND NOT EXISTS(SELECT 1 FROM ai_jobs j WHERE j.learner_id=u.id AND j.learning_day=? AND j.kind='plan' AND j.purpose='daily' AND j.status='succeeded')").bind(day).first<{n:number}>();
  if(rows?.n)conditions.push({code:'nightly-plan-missing',message:'Có '+rows.n+' lượt soạn bài đêm chưa hoàn tất. Bài đang học được giữ nguyên.'});
 }
 const failed=await db.prepare("SELECT count(*) AS n FROM ai_jobs WHERE learning_day=? AND status='failed'").bind(day).first<{n:number}>();
 if(failed?.n)conditions.push({code:'job-failed',message:'Có '+failed.n+' công việc xử lý thất bại. Xem nhật ký để kiểm tra.'});
 const unknown=await db.prepare("SELECT count(*) AS n FROM ai_jobs WHERE learning_day=? AND status='succeeded' AND usage IS NOT NULL AND cost_usd IS NULL").bind(day).first<{n:number}>();if(unknown?.n)conditions.push({code:'price-missing',message:'Có lượt xử lý chưa tính được chi phí vì thiếu bảng giá.'});
 const spent=await db.prepare('SELECT coalesce(sum(cost_usd),0) AS cost FROM ai_jobs WHERE learning_day=?').bind(day).first<{cost:number}>();
 const threshold=Number(bindings.AI_COST_ALERT_USD??3);if(spent&&spent.cost>=threshold)conditions.push({code:'cost-high',message:'Chi phí ước tính vượt ngưỡng '+threshold+' USD hôm nay. Kiểm tra ngân sách.'});
 for(const c of conditions)await db.prepare("INSERT OR IGNORE INTO alert_events(id,learning_day,code,message,created_at) VALUES(?,?,?,?,?)").bind('alert_'+(await sha256Hex(day+':'+c.code)).slice(0,20),day,c.code,c.message,now.toISOString()).run();
 return conditions;
}
export async function sendAlertDigest(db:EvidenceDb,bindings:AlertBindings,now=new Date(),fetcher:typeof fetch=fetch){
 await collectAlerts(db,bindings,now);
 const day=berlinDay(now),{results:alerts=[]}=await db.prepare("SELECT id,message,code FROM alert_events WHERE learning_day=? AND email_state='pending' ORDER BY code").bind(day).all<{id:string;message:string;code:string}>();
 if(!alerts.length||!bindings.RESEND_API_KEY||!bindings.EMAIL_FROM)return {sent:false};
 const admin=await db.prepare("SELECT email FROM user WHERE role='admin' AND status='active' ORDER BY created_at LIMIT 1").first<{email:string}>();if(!admin)return {sent:false};
 // The 06:00 missing-plan warning has its own once-per-day delivery claim.
 // Other alerts share a digest. Claim before sending; uncertain delivery is not retried.
 let sent=false;
 for(const urgent of [true,false]){
  const selected=alerts.filter(a=>(a.code==='nightly-plan-missing')===urgent);
  if(!selected.length)continue;
  const condition=urgent?"code='nightly-plan-missing'":"code<>'nightly-plan-missing'";
  const changed=await db.prepare(`UPDATE alert_events SET email_state='sending' WHERE learning_day=? AND email_state='pending' AND ${condition} AND NOT EXISTS(SELECT 1 FROM alert_events WHERE learning_day=? AND ${condition} AND email_state IN ('sending','sent','failed'))`).bind(day,day).run();
  if(!changed.meta.changes)continue;
  try{
   const text=selected.map(a=>a.message).join('\n');
   await sendAuthEmail(bindings,{to:admin.email,subject:'Learning Hub · cần kiểm tra '+day,text,html:'<p>'+text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('\n','</p><p>')+'</p>'},fetcher);
   await db.prepare(`UPDATE alert_events SET email_state='sent',sent_at=? WHERE learning_day=? AND email_state='sending' AND ${condition}`).bind(now.toISOString(),day).run();sent=true;
  }catch{
   await db.prepare(`UPDATE alert_events SET email_state='failed' WHERE learning_day=? AND email_state='sending' AND ${condition}`).bind(day).run();
   return {sent,error:'Email chưa được xác nhận; không tự gửi lại.'};
  }
 }
 return {sent};
}
