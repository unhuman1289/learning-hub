import Anthropic from '@anthropic-ai/sdk';
import {jsonSchemaOutputFormat} from '@anthropic-ai/sdk/helpers/json-schema';
import system from './system.mjs';
export function createModel(env,{fetcher}={}){
 const client=new Anthropic({apiKey:env.ANTHROPIC_API_KEY,maxRetries:0,timeout:170000,...(fetcher?{fetch:fetcher}:{})});
 return async(context,schema,images=[],issues=null)=>{
  const started=Date.now();
  const response=await client.messages.create({model:env.ANTHROPIC_MODEL??'claude-opus-5-5',max_tokens:8000,thinking:{type:'adaptive'},output_config:{effort:'high',format:jsonSchemaOutputFormat(schema)},system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],messages:[{role:'user',content:[...images,{type:'text',text:JSON.stringify({context,...(issues?{validationIssues:issues}:{})})}]}]});
  if(response.stop_reason==='max_tokens'||response.stop_reason==='refusal')throw Error('Model did not return a complete assessment');
  const text=response.content.filter(c=>c.type==='text').map(c=>c.text).join('');
  const result=JSON.parse(text);result.usage={model:response.model,inputTokens:response.usage.input_tokens,outputTokens:response.usage.output_tokens,cacheReadTokens:response.usage.cache_read_input_tokens??0,cacheWriteTokens:response.usage.cache_creation_input_tokens??0,ms:Date.now()-started};
  return result;
 };
}
