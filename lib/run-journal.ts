import {berlinDay,cutoffFor,learningTracks} from './daily-policy.ts';
import type {LearningTrack} from './daily-policy.ts';
import {assignmentSql} from './daily-sql.ts';
import type {RunInput} from './run-schema.ts';
import {ApiError} from './api-error.ts';
import type {RunEntry,RunItem,RunHealth} from './daily-types.ts';

export type Statement={bind(...values:unknown[]):Statement;run():Promise<{meta:{changes?:number}}>;
 first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>};
export type JournalDb={prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown[]>};
export type RunRow={id:string,day:string,status:'started'|'finished'|'failed',started_at:string,finished_at:string|null,summary:string,error:string|null,origin:string,request_hash:string|null};
type ItemRow={run_id:string,user_id:string,track:LearningTrack,outcome:RunItem['outcome'],reason:string,previous_lesson_id:string|null,lesson_id:string|null,sources:string};
const expired=(r:RunRow,now:Date)=>r.status==='started'&&now.getTime()-Date.parse(r.started_at)>2*3600000;
const decode=(r:RunRow,items:ItemRow[],now:Date):RunEntry=>({id:r.id,day:r.day,status:expired(r,now)?'failed':r.status,startedAt:r.started_at,finishedAt:r.finished_at,summary:r.summary,error:expired(r,now)?'Lượt chạy đã bắt đầu hơn 2 giờ nhưng chưa kết thúc.':r.error,origin:r.origin,items:items.filter(i=>i.run_id===r.id).map(i=>({userId:i.user_id,track:i.track,outcome:i.outcome,reason:i.reason,previousLessonId:i.previous_lesson_id,lessonId:i.lesson_id,sources:JSON.parse(i.sources)}))});
export async function readRunJournal(db:JournalDb,now=new Date()){
 const rows=(await db.prepare('SELECT * FROM runs ORDER BY started_at DESC, rowid DESC LIMIT 20').all<RunRow>()).results;
 const items=rows.length?(await db.prepare(`SELECT * FROM legacy_run_items WHERE run_id IN (${rows.map(()=>'?').join(',')}) ORDER BY track`).bind(...rows.map(r=>r.id)).all<ItemRow>()).results:[];
 const success=await db.prepare("SELECT finished_at FROM runs WHERE status='finished' ORDER BY finished_at DESC LIMIT 1").first<{finished_at:string}>();
 const stalled=(await db.prepare("SELECT * FROM runs WHERE status='started' AND started_at < ? ORDER BY started_at DESC LIMIT 1").bind(new Date(now.getTime()-2*3600000).toISOString()).first<RunRow>());
 const latest=rows[0];
 const health:RunHealth={lastSuccessfulAt:success?.finished_at??null,stale:!success||now.getTime()-Date.parse(success.finished_at)>26*3600000,stalledRunId:stalled?.id??null,latestFailed:!!latest&&(latest.status==='failed'||expired(latest,now))};
 return {runs:rows.map(r=>decode(r,items,now)),health};
}
export async function startRun(db:JournalDb,origin:'scheduled'|'manual'='scheduled',now=new Date()){
 const runId=crypto.randomUUID();
 await db.prepare("INSERT INTO runs(id,day,status,started_at,summary,origin) VALUES(?,?,'started',?,'',?)").bind(runId,berlinDay(now),now.toISOString(),origin).run();
 return runId;
}
export async function getRun(db:JournalDb,id:string){
 const r=await db.prepare('SELECT * FROM runs WHERE id=?').bind(id).first<RunRow>();
 if(!r)throw new ApiError(404,'Không tìm thấy lượt chạy. GET ngữ cảnh để bắt đầu một lượt mới.');
 return r;
}
export async function failRun(db:JournalDb,id:string,message:string,now=new Date()){
 await db.prepare("UPDATE runs SET status='failed', finished_at=?,error=? WHERE id=? AND status='started'").bind(now.toISOString(),message.slice(0,1000),id).run();
}
export async function commitRun(db:JournalDb,input:RunInput,userId:string,now=new Date()){
 if(!userId)throw new ApiError(401,'A verified learner ID is required.');
 const day=berlinDay(now),stamp=now.toISOString(),run=await getRun(db,input.runId);
 if(input.runDate!==day||run.day!==day)throw new ApiError(400,'Ngày chạy phải là hôm nay theo Europe/Berlin.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 if(run.status!=='started'){
   if(run.request_hash===hash)return {runId:input.runId,replayed:true,...await readRunJournal(db,now)};
   throw new ApiError(409,'Lượt chạy đã kết thúc với nội dung khác. Đọc lại trước khi bắt đầu lượt mới.');
 }
 if(expired(run,now))throw new ApiError(409,'Lượt chạy quá 2 giờ. Đọc lại và bắt đầu lượt mới.');
 const active=(await db.prepare('SELECT l.id,l.track FROM learning_slots s JOIN learning_lessons l ON l.user_id=s.user_id AND l.id=s.lesson_id WHERE s.user_id=?').bind(userId).all<{id:string,track:LearningTrack}>()).results;
 const batch:Statement[]=[];
 // Claim this run inside the same D1 transaction as assignments and journal.
 // Every subsequent write checks this claim, so a racing retry cannot rewrite it.
 const running="EXISTS(SELECT 1 FROM runs WHERE id=? AND status='started' AND request_hash=?)";
 batch.push(db.prepare("UPDATE runs SET request_hash=? WHERE id=? AND status='started' AND request_hash IS NULL").bind(hash,input.runId));
 for(const track of learningTracks){
   const proposal=input.lessons.find(l=>l.track===track),issue=input.issues.find(i=>i.track===track);
   const previous=active.find(l=>l.track===track)?.id??null;
   const id=`les_${crypto.randomUUID().replaceAll('-','')}`;
   if(proposal){
     const sql=assignmentSql({userId,track,expectedId:proposal.expectedId,id,content:JSON.stringify(proposal.content),day,now:stamp,cutoff:cutoffFor(day)});
     // assignmentSql's WHERE predicates precede ON CONFLICT; add the run claim
     // to both before preparing, without changing the completion guard.
     for(const q of sql){
       const at=q.sql.indexOf(' ON CONFLICT');
       const original=at<0?q.sql:q.sql.slice(0,at);
       const suffix=at<0?'':q.sql.slice(at);
       const where=original.indexOf(' WHERE ');
       const guarded=original.slice(0,where)+' WHERE ('+original.slice(where+7)+') AND '+running+suffix;
       batch.push(db.prepare(guarded).bind(...q.args,input.runId,hash));
     }
   }
   const current='(SELECT lesson_id FROM learning_slots WHERE user_id=? AND track=?)';
   const updated=proposal?'changes()>0':'0';
   const reasonSql=`CASE
     WHEN ${current} IS NOT ? THEN 'Bài hiện tại đã thay đổi; đề xuất dùng ID cũ.'
     WHEN EXISTS(SELECT 1 FROM learning_lessons l JOIN learning_slots s ON s.user_id=l.user_id AND s.lesson_id=l.id WHERE s.user_id=? AND s.track=? AND l.completed_at IS NULL) THEN 'Bài chưa hoàn thành; giữ nguyên nội dung và câu trả lời.'
     WHEN EXISTS(SELECT 1 FROM learning_lessons l JOIN learning_slots s ON s.user_id=l.user_id AND s.lesson_id=l.id WHERE s.user_id=? AND s.track=? AND l.assigned_date=?) THEN 'Mảng này đã nhận bài hôm nay; không thay lần thứ hai.'
     WHEN EXISTS(SELECT 1 FROM learning_lessons l JOIN learning_slots s ON s.user_id=l.user_id AND s.lesson_id=l.id WHERE s.user_id=? AND s.track=? AND l.completed_at>=?) THEN 'Hoàn thành sau mốc 03:00; chờ ngày tiếp theo.'
     ELSE 'Chưa có bài đề xuất được xác minh cho mảng này.' END`;
   const reasonArgs=[userId,track,proposal?.expectedId??previous,userId,track,userId,track,day,userId,track,cutoffFor(day)];
   const outcome=`CASE WHEN ?=1 THEN 'error' WHEN ${updated} THEN 'updated' WHEN ?=1 THEN 'kept' WHEN ${current} IS NOT NULL THEN 'kept' ELSE 'skipped' END`;
   const reason=`CASE WHEN ?=1 THEN ? WHEN ${updated} THEN 'Đã gán bài mới; giữ bài và câu trả lời cũ trong lịch sử.' ELSE ${reasonSql} END`;
   batch.push(db.prepare(`INSERT OR IGNORE INTO legacy_run_items(run_id,user_id,track,outcome,reason,previous_lesson_id,lesson_id,sources) SELECT ?,?,?,${outcome},${reason},?,${current},? WHERE ${running}`).bind(
     input.runId,userId,track,issue?1:0,issue?1:0,userId,track,
     issue?1:0,issue?.reason??'',...reasonArgs,
     previous,userId,track,JSON.stringify(proposal?.content.sources??[]),input.runId,hash));
 }
 batch.push(db.prepare(`UPDATE runs SET status=CASE WHEN EXISTS(SELECT 1 FROM legacy_run_items WHERE run_id=? AND outcome='error') THEN 'failed' ELSE 'finished' END,finished_at=?,summary=?,error=CASE WHEN EXISTS(SELECT 1 FROM legacy_run_items WHERE run_id=? AND outcome='error') THEN 'Có mảng không cập nhật được. Xem chi tiết lượt chạy.' ELSE NULL END WHERE id=? AND status='started' AND request_hash=?`).bind(input.runId,stamp,input.summary,input.runId,input.runId,hash));
 await db.batch(batch);
 const saved=await getRun(db,input.runId);
 if(saved.request_hash!==hash)throw new ApiError(409,'Lượt chạy đã nhận nội dung khác. Đọc lại trước khi thử lại.');
 return {runId:input.runId,replayed:false,...await readRunJournal(db,now)};
}
