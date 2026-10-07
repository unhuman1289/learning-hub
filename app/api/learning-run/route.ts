import {applyRun,learningContext,runSchema} from '../../../lib/daily-store';
// This shared updater relies on Sites' authenticated hosting boundary for the
// owner-private Site. Service access is consumed there; no app tokens are copied.
// If the Site's audience changes, review this endpoint's service authorization.
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try{return Response.json(await learningContext(),{headers});}catch(e){console.error(e);return Response.json({error:'Learning updater unavailable'},{status:503,headers});}}
export async function POST(req:Request){
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origin rejected'},{status:403,headers});
 try{const raw=await req.text();if(raw.length>300000)return Response.json({error:'Payload too large'},{status:413,headers});const parsed=runSchema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Invalid lesson payload',details:parsed.error.flatten()},{status:400,headers});return Response.json(await applyRun(parsed.data),{headers});}catch(e){console.error(e);return Response.json({error:'Update failed; read current state before retrying.'},{status:400,headers});}
}
