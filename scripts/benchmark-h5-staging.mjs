import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {berlinBackupDay} from '../lib/backup-schedule.mjs';
const args=process.argv.slice(2),file=args[args.indexOf('--manifest')+1];
if(!args.includes('--manifest'))throw Error('Requires private QA --manifest.');
const m=JSON.parse(readFileSync(file,'utf8'));
if(m.environment!=='staging'||m.origin!=='https://learning-hub-staging.tranvu-812.workers.dev'||!/^qa-h5-[a-f0-9]{20}$/.test(m.learnerId))throw Error('Staging synthetic QA only.');
const folder=file.slice(0,file.lastIndexOf('/')),q=x=>"'"+String(x).replaceAll("'","''")+"'";
if(args.includes('--prepare')){
 const nonce=randomBytes(10).toString('hex'),now=new Date(),stamp=now.toISOString();let sql=`UPDATE subjects SET status='paused' WHERE learner_id=${q(m.learnerId)};\n`;
 for(let s=0;s<3;s++){
  const subject='sub_'+nonce+s;
  sql+=`INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at) VALUES(${q(subject)},${q(m.learnerId)},'QA CPU ${s}','skill','active',1,'CPU stress test only','A2',${q(m.learnerId)},${q(stamp)},${q(stamp)});\n`;
  for(let i=0;i<120;i++){
   const id='sk_'+createHash('sha256').update(subject+':'+i).digest('hex').slice(0,20);
   sql+=`INSERT INTO skills(id,subject_id,learner_id,key,name,path_order,status,origin,created_at,updated_at) VALUES(${q(id)},${q(subject)},${q(m.learnerId)},${q(i===0?'modalverb-infinitiv':'qa-'+i)},${q(('QA technical skill '+i+' ').padEnd(120,'x'))},${i},${q(i===0?'active':'planned')},'user',${q(stamp)},${q(stamp)});\n`;
  }
 }
 sql+=`INSERT INTO ai_jobs(id,kind,purpose,trigger,learner_id,learning_day,priority,status,dedupe_key,created_at,updated_at,expires_at) VALUES('job_${nonce}','plan','daily','scheduled',${q(m.learnerId)},${q(berlinBackupDay(now))},40,'queued','cpu:${nonce}',${q(stamp)},${q(stamp)},${q(new Date(+now+7200000).toISOString())});`;
 writeFileSync(folder+'/benchmark.sql',sql,{mode:0o600});console.log(JSON.stringify({prepared:folder+'/benchmark.sql',syntheticOnly:true}));
}else if(args.includes('--run')){
 const c=m.credentials,headers={'Content-Type':'application/json',Authorization:c.bearer,'CF-Access-Client-Id':c.accessClientId,'CF-Access-Client-Secret':c.accessClientSecret};
 const call=async(path,method='GET',body,token)=>{const r=await fetch(m.origin+'/api/automation/v2'+path,{method,headers:{...headers,...(token?{'X-Lease-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json().catch(()=>null);if(!r.ok)throw Error('Benchmark API '+r.status+' '+JSON.stringify(v?.errors?.map(e=>e.code)));return v;};
 const {jobs}=await call('/jobs/lease','POST',{kinds:['plan'],max:1,runner:{name:'h5-cpu-qa',version:'1',model:'none'}}),job=jobs[0];if(!job)throw Error('No benchmark QA job.');
 const ctx=await call('/jobs/'+job.jobId+'/context','GET',undefined,job.leaseToken);if(ctx.learner.ref!==c.expectedLearnerRef||ctx.subjects.length!==3)throw Error('Wrong synthetic context.');
 const fixture=JSON.parse(readFileSync('fixtures/lessons/deutsch-modalverb.json','utf8')),lessonBytes=[];
 const subjects=ctx.subjects.map(s=>{
  const l=structuredClone(fixture),sk=s.skills.find(x=>x.key==='modalverb-infinitiv').skillId;l.title='QA CPU · không dùng để học';l.estMinutes=20;l.targetSkills=[sk];l.reasonRefs=[sk];
  const item=fixture.items.find(i=>i.rubric);l.items=Array.from({length:14},(_,n)=>({...structuredClone(item),id:'i'+(n+1),skills:[sk],prompt:('QA '+s.subjectId+' '+n+' ').padEnd(1600,'x'),instructions:'QA '.repeat(260),solution:'QA '.repeat(850),explanation:'QA '.repeat(300),hints:['QA '.repeat(150),'QA '.repeat(150)]}));
  l.stages=[{stage:'retrieval',itemIds:l.items.slice(0,2).map(i=>i.id)},{stage:'sheet',itemIds:[]},{stage:'guided',itemIds:l.items.slice(2,7).map(i=>i.id)},{stage:'independent',itemIds:l.items.slice(7).map(i=>i.id)}];
  const target=96*1024-512;let size=Buffer.byteLength(JSON.stringify(l));
  for(const i of l.items){if(size<=target)break;const delta=Math.min(i.instructions.length,size-target);i.instructions=i.instructions.slice(0,i.instructions.length-delta);size-=delta;}
  for(const i of l.items){if(size<=target)break;const delta=Math.min(i.explanation.length,size-target);i.explanation=i.explanation.slice(0,i.explanation.length-delta);size-=delta;}
  for(const i of l.items){if(size>=target)break;const delta=Math.min(3000-i.solution.length,target-size);i.solution+='x'.repeat(delta);size+=delta;}
  lessonBytes.push(Buffer.byteLength(JSON.stringify(l)));
  return {subjectId:s.subjectId,expectedRevision:s.revision,expectedOpenPrimaryLessonId:s.slot.openPrimaryLessonId,action:'assign',reason:'Synthetic CPU acceptance only',skillChanges:[],primaryLesson:l,reviewSet:null,masteryProposals:[],progressSummary:'QA only',requestsHandled:[]};
 });
 const result={contract:'plan-result/1',contextHash:ctx.contextHash,summary:'QA CPU',subjects,explorations:[],usage:{model:'none',inputTokens:0,outputTokens:0,ms:0}};
 await call('/jobs/'+job.jobId+'/result?dryRun=1','POST',result,job.leaseToken);await call('/jobs/'+job.jobId+'/result','POST',result,job.leaseToken);
 const saved=await call('/jobs/'+job.jobId);if(saved.status!=='succeeded'||saved.outcome.subjects.filter(s=>s.status==='applied').length!==3)throw Error('Three-subject apply failed.');
 const report={jobId:job.jobId,contextBytes:Buffer.byteLength(JSON.stringify(ctx)),lessonBytes,subjectsApplied:3,truncatedCount:ctx.truncated.length};
 writeFileSync(folder+'/benchmark-report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}else throw Error('Choose --prepare or --run.');
