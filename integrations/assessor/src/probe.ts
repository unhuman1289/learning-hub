// Synthetic wall-time probe. No learner data, model calls, or public enqueue access.
type Env={ROLE:string;PROBE_SECRET?:string;Q:Queue;DELAY_ORIGIN:string;DELAY?:Fetcher};
const probe = {
 async fetch(request:Request,env:Env){
  if(new URL(request.url).pathname==='/health')return Response.json({role:env.ROLE});
  if(!env.PROBE_SECRET||request.headers.get('Authorization')!=='Bearer '+env.PROBE_SECRET)return new Response('Unauthorized',{status:401});
  if(env.ROLE==='delay'&&new URL(request.url).pathname==='/wait'){
   await new Promise(resolve=>setTimeout(resolve,130000));return Response.json({waitedSeconds:130});
  }
  if(env.ROLE==='consumer'&&request.method==='POST'&&new URL(request.url).pathname==='/start'){
   const nonce=crypto.randomUUID();await env.Q.send({nonce});return Response.json({queued:nonce});
  }
  return new Response('Not found',{status:404});
 },
 async queue(batch:MessageBatch<{nonce:string}>,env:Env){for(const m of batch.messages){const start=Date.now();
  try{const r=await (env.DELAY?env.DELAY.fetch.bind(env.DELAY):fetch)(env.DELAY_ORIGIN+'/wait',{headers:{Authorization:'Bearer '+env.PROBE_SECRET},signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Delay unavailable '+r.status);const data=await r.json() as {waitedSeconds:number};console.log(JSON.stringify({probe:m.body.nonce,result:data.waitedSeconds===130?'PASS':'FAIL',wallMs:Date.now()-start}));m.ack();}
  catch{console.log(JSON.stringify({probe:m.body.nonce,result:'FAIL',wallMs:Date.now()-start}));m.ack();}
 }},
};

export default probe;
