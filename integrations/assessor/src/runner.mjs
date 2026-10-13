import {HubClient} from './hub.mjs';
// One invocation handles at most one assessment. Writes are never blindly retried.
export async function runAssessment(env,{fetcher=fetch,model,allowedLearnerRef=env.PILOT_LEARNER_REF}={}){
 if(env.ASSESSOR_ENABLED!=='true')return {status:'disabled'};
 if(!env.ANTHROPIC_API_KEY)throw Error('Anthropic key missing; assessor remains unavailable');
 if(!/^sub_[a-f0-9]{20}$/.test(env.PILOT_SUBJECT_ID??''))throw Error('Pilot subject required');
 if(!/^lrn_[a-f0-9]{12}$/.test(allowedLearnerRef??''))throw Error('Pilot learner required');
 const hub=new HubClient(env,fetcher),leased=await hub.call('/api/automation/v2/jobs/lease',{method:'POST',body:{kinds:['assess'],max:1,runner:{name:'learning-hub-assessor',version:'1',model:env.ANTHROPIC_MODEL}}});
 const job=leased.jobs?.[0];if(!job)return {status:'idle'};
 const base='/api/automation/v2/jobs/'+job.jobId,opts={leaseToken:job.leaseToken};
 let applying=false;
 try{
  const context=await hub.call(base+'/context',opts);
  if(context.learner.ref!==allowedLearnerRef||context.learner.role!=='adult'||context.subject.sensitivity!=='normal'||context.subject.subjectId!==env.PILOT_SUBJECT_ID)throw Error('Outside adult pilot scope');
  if(new TextEncoder().encode(JSON.stringify(context)).byteLength>65000)throw Error('Context too large');
  const images=[];for(const item of context.attempts)for(const attachment of item.attachments??[]){if(attachment.expired)continue;if(images.length>=5)throw Error('Pilot attachment cap exceeded');const image=await hub.call(attachment.url,opts);if(!image.image)throw Error('Image unavailable');images.push(image.image);}
  const schemas=await hub.call('/api/automation/v2/schema');
  const schema=schemas.contracts['assess-result/1'];
  let result=await model(context,schema,images);
  let checked=await hub.call(base+'/result?dryRun=1',{...opts,method:'POST',body:result});
  if(checked.status===422){result=await model(context,schema,images,checked.errors??checked.issues??checked);checked=await hub.call(base+'/result?dryRun=1',{...opts,method:'POST',body:result});}
  if(checked.status===422)throw Error('Assessment failed server validation');
  await hub.call(base+'/heartbeat',{...opts,method:'POST',body:{}});
  applying=true;
  await hub.call(base+'/result',{...opts,method:'POST',body:result});
  const saved=await hub.call(base);if(saved.status!=='succeeded')return {status:'uncertain',jobId:job.jobId};
  return {status:'succeeded',jobId:job.jobId,outcome:saved.outcome};
 }catch(error){
  if(applying){try{const saved=await hub.call(base);return {status:saved.status==='succeeded'?'succeeded':'uncertain',jobId:job.jobId};}catch{return {status:'uncertain',jobId:job.jobId};}}
  const retryable=error?.status===429||(error?.status>=500&&error?.status<600);
  const failed=await hub.call(base+'/fail',{...opts,method:'POST',body:{reason:'Assessment unavailable or validation failed',retryable}}).catch(()=>null);
  return {status:failed?.status==='queued'?'queued':'failed',jobId:job.jobId};
 }
}
