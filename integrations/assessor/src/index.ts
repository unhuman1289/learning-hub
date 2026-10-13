import {runAssessment} from './runner.mjs';
import {createModel} from './model.mjs';
import {HubClient} from './hub.mjs';
type Bindings={ASSESSOR_ENABLED:string;ANTHROPIC_API_KEY?:string;ANTHROPIC_MODEL:string;HUB_ORIGIN:string;HUB_AUTOMATION_BEARER?:string;ACCESS_CLIENT_ID?:string;ACCESS_CLIENT_SECRET?:string;PILOT_LEARNER_REF:string;PILOT_SUBJECT_ID:string};
async function run(env:Bindings){return runAssessment(env,{model:env.ASSESSOR_ENABLED==='true'?createModel(env):undefined});}
const worker = {
 async fetch(request:Request,env:Bindings){
  const path=new URL(request.url).pathname;
  if(path==='/connection-check'&&request.method==='POST'){
   if(!env.HUB_AUTOMATION_BEARER||request.headers.get('Authorization')!==env.HUB_AUTOMATION_BEARER)return new Response('Unauthorized',{status:401});
   try{const schema=await new HubClient(env).call('/api/automation/v2/schema');return Response.json({connected:Boolean(schema.contracts?.['assess-result/1']),modelEnabled:env.ASSESSOR_ENABLED==='true'});}catch(e){
    let diagnostic=e instanceof Error?e.message:'Unknown error';
    for(const secret of [env.HUB_AUTOMATION_BEARER,env.ACCESS_CLIENT_ID,env.ACCESS_CLIENT_SECRET,env.ANTHROPIC_API_KEY])if(secret)diagnostic=diagnostic.split(secret).join('[redacted]');
    return Response.json({connected:false,error:diagnostic.slice(0,200)},{status:502});
   }
  }
  if(path!=='/health'||request.method!=='GET')return new Response('Not found',{status:404});
  return Response.json({service:'learning-hub-assessor',enabled:env.ASSESSOR_ENABLED==='true',automationConfigured:Boolean(env.HUB_AUTOMATION_BEARER&&env.ACCESS_CLIENT_ID&&env.ACCESS_CLIENT_SECRET),modelConfigured:Boolean(env.ANTHROPIC_API_KEY),configured:Boolean(env.ANTHROPIC_API_KEY&&env.HUB_AUTOMATION_BEARER&&env.ACCESS_CLIENT_ID&&env.ACCESS_CLIENT_SECRET)});
 },
 async scheduled(_event:ScheduledController,env:Bindings,ctx:ExecutionContext){ctx.waitUntil(run(env).then(r=>{console.log(JSON.stringify({status:r.status}));}));},
 async queue(batch:MessageBatch<{kind?:string}>,env:Bindings){for(const message of batch.messages){if(message.body.kind!=='assess'){message.ack();continue;}try{const r=await run(env);if(r.status==='queued'){message.retry({delaySeconds:300});continue;}if(r.status==='uncertain')console.warn('Assessment outcome uncertain; inspect same job, no automatic resend.');message.ack();}catch{message.retry({delaySeconds:300});}}},
};

export default worker;
