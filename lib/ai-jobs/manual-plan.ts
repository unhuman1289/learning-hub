import {ApiError} from '../api-error.ts';
import type {EvidenceDb} from '../evidence/submit.ts';
import {enqueue,type QueueBindings} from './queue.ts';
export const manualRequestId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function readManualPlan(db:EvidenceDb,learnerId:string,requestId:string){
 if(!manualRequestId.test(requestId))throw new ApiError(400,'Mã lượt không hợp lệ.');
 return db.prepare("SELECT id,status FROM ai_jobs WHERE learner_id=? AND kind='plan' AND purpose='daily' AND dedupe_key LIKE ?").bind(learnerId,'%:manual:'+requestId).first<{id:string;status:string}>();
}
export async function createManualPlan(db:EvidenceDb,bindings:QueueBindings,learnerId:string,requestId:string,subjectId?:string,now=new Date()){
 const saved=await readManualPlan(db,learnerId,requestId);if(saved)return {...saved,created:false};
 let selected=subjectId;
 if(selected){
  if(!await db.prepare("SELECT id FROM subjects WHERE id=? AND learner_id=? AND status='active' AND ai_enabled=1").bind(selected,learnerId).first())throw new ApiError(404,'Không tìm thấy sổ đang bật soạn bài.');
 }else{
  const {results=[]}=await db.prepare("SELECT id FROM subjects WHERE learner_id=? AND status='active' AND ai_enabled=1 ORDER BY id LIMIT 2").bind(learnerId).all<{id:string}>();
  if(results.length!==1)throw new ApiError(400,results.length?'Cần chọn sổ khi người học có nhiều sổ đang bật soạn bài.':'Người học chưa có sổ đang bật soạn bài.');
  selected=results[0].id;
 }
 return enqueue(db,bindings,{learnerId,subjectId:selected,kind:'plan',purpose:'daily',manualRunId:requestId},now);
}
