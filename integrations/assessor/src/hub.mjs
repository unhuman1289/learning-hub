export class HubClient {
 constructor(env,fetcher=fetch){
  if(!['https://learning-hub-staging.tranvu-812.workers.dev','https://learn.unhuman.cc'].includes(env.HUB_ORIGIN))throw Error('Invalid Hub origin');
  if(!env.HUB_AUTOMATION_BEARER||!env.ACCESS_CLIENT_ID||!env.ACCESS_CLIENT_SECRET)throw Error('Assessor credentials missing');
  this.env=env;this.fetcher=fetcher;
 }
 async call(path,{method='GET',body,leaseToken}={}){
  if(!/^\/api\/automation\/v2\/(schema|jobs(?:\/lease|\/job_[a-f0-9]{20}(?:\/(?:context|result|heartbeat|fail|attachments\/img_[a-f0-9]{20}))?)?)$/.test(path.split('?')[0]))throw Error('Unexpected Hub path');
  const fetcher=this.fetcher;
  const response=await fetcher(this.env.HUB_ORIGIN+path,{method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Authorization:this.env.HUB_AUTOMATION_BEARER,'CF-Access-Client-Id':this.env.ACCESS_CLIENT_ID,'CF-Access-Client-Secret':this.env.ACCESS_CLIENT_SECRET,...(leaseToken?{'X-Lease-Token':leaseToken}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const contentType=response.headers.get('Content-Type')??'';
  if(contentType.startsWith('image/')){if(!response.ok)throw Error('Attachment unavailable');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>3000000)throw Error('Attachment exceeds limit');let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {image:{type:'image',source:{type:'base64',media_type:contentType.split(';')[0],data:btoa(binary)}}};}
  const data=await response.json();if(!response.ok&&response.status!==422)throw Error('Hub response '+response.status);return data;
 }
}
