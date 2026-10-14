import {z} from 'zod/v4';
import {ProtocolError,type McpServer} from '@modelcontextprotocol/server';
import {ApiError} from '../api-error.ts';
import type {AutomationClient} from '../auth/automation.ts';
import {eventsEnabled,listEvents,subscribe,unsubscribe,subscribeSchema,unsubscribeSchema,type EventBindings} from './events.ts';
export async function checked<T>(run:()=>Promise<T>){
 console.info(JSON.stringify({component:'mcp-events',operation:'subscribe',phase:'handler_started'}));
 try{const result=await run();console.info(JSON.stringify({component:'mcp-events',operation:'subscribe',phase:'stored'}));return result;}
 catch(e){
  const category=e instanceof ApiError?(e.status===403?'forbidden':e.status===429?'limit':e.status===400?'invalid_callback_or_secret':'callback_failed'):'unavailable';
  console.info(JSON.stringify({component:'mcp-events',operation:'subscribe',phase:'failed',category}));
  if(e instanceof ApiError){if(e.status===403)throw new ProtocolError(-32024,'Event không được phép.');if(e.status===429)throw new ProtocolError(-32000,'Subscription limit reached.');if(e.status===400)throw new ProtocolError(-32602,e.message);throw new ProtocolError(-32015,'Callback verification failed.',{reason:'challenge_failed'});}
  throw new ProtocolError(-32015,'Callback verification failed.',{reason:'timeout_or_unavailable'});
 }
}
export function registerEvents(server:McpServer,env:EventBindings,principal:AutomationClient,userId:string,clientId:string){
 if(!eventsEnabled(env))return;
 server.server.registerCapabilities({events:{}} as Parameters<typeof server.server.registerCapabilities>[0]);
 server.server.setRequestHandler('events/list',{params:z.object({cursor:z.null().optional()}).strict(),result:z.looseObject({})},()=>listEvents(env.DB,principal));
 server.server.setRequestHandler('events/subscribe',{params:subscribeSchema,result:z.looseObject({})},p=>checked(()=>subscribe(env,principal,userId,clientId,p)));
 server.server.setRequestHandler('events/unsubscribe',{params:unsubscribeSchema,result:z.looseObject({})},p=>unsubscribe(env.DB,userId,clientId,p));
}
