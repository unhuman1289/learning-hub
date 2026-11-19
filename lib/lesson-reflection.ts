import {z} from 'zod/v4';
import type {EvidenceDb} from './evidence/submit.ts';
import {ApiError} from './api-error.ts';
export const reflectionInput=z.object({revision:z.number().int().min(0),difficulty:z.enum(['easy','fit','hard']),usefulness:z.enum(['useful','mixed','not_useful']),minutes:z.number().int().min(1).max(720),note:z.string().trim().max(1500)}).strict();
export async function reflectionOwner(db:EvidenceDb,learner:string,id:string){
 const submission=await db.prepare('SELECT s.id,s.lesson_id,l.subject_id FROM submissions s JOIN learning_lessons l ON l.id=s.lesson_id WHERE s.id=? AND s.learner_id=? AND l.user_id=?').bind(id,learner,learner).first<{id:string;lesson_id:string;subject_id:string}>();
 if(!submission)throw new ApiError(404,'Không tìm thấy lượt nộp.');
 return submission;
}
const latestReflection = `FROM lesson_reflections WHERE lesson_id=? AND learner_id=?
 ORDER BY updated_at DESC,created_at DESC,submission_id DESC LIMIT 1`;

export async function readReflection(db:EvidenceDb,learner:string,id:string){
 const {lesson_id}=await reflectionOwner(db,learner,id);
 return db.prepare(`SELECT difficulty,usefulness,minutes,note,revision ${latestReflection}`).bind(lesson_id,learner).first();
}

export async function saveReflection(db:EvidenceDb,learner:string,id:string,input:unknown,now=new Date()){
 const p=reflectionInput.parse(input),s=await reflectionOwner(db,learner,id);
 const pending=await db.prepare("SELECT count(*) AS total,sum(CASE WHEN status<>'graded' OR current_grade_id IS NULL THEN 1 ELSE 0 END) AS pending FROM attempts WHERE submission_id=? AND learner_id=?").bind(id,learner).first<{total:number;pending:number}>();
 if(!pending?.total||pending.pending)throw new ApiError(409,'Đợi chấm xong, đọc lời phê và sửa bài trước khi gửi góp ý.');
 const time=now.toISOString();
 // Keep the submission FK for old data, but choose the latest row and check its
 // revision in the write itself so two submissions cannot create separate feedback.
 const saved=await db.prepare(`
 WITH current AS (SELECT submission_id,revision ${latestReflection})
 INSERT INTO lesson_reflections(submission_id,learner_id,lesson_id,subject_id,difficulty,usefulness,minutes,note,revision,created_at,updated_at)
 SELECT coalesce((SELECT submission_id FROM current),?),?,?,?,?,?,?,?,?+1,?,?
 WHERE coalesce((SELECT revision FROM current),0)=?
 ON CONFLICT(submission_id) DO UPDATE SET
   difficulty=excluded.difficulty,usefulness=excluded.usefulness,minutes=excluded.minutes,
   note=excluded.note,revision=excluded.revision,updated_at=max(lesson_reflections.updated_at,excluded.updated_at)
 WHERE lesson_reflections.learner_id=excluded.learner_id AND lesson_reflections.lesson_id=excluded.lesson_id
   AND lesson_reflections.revision=excluded.revision-1
 RETURNING revision
 `).bind(s.lesson_id,learner,s.id,learner,s.lesson_id,s.subject_id,p.difficulty,p.usefulness,p.minutes,p.note,p.revision,time,time,p.revision).first<{revision:number}>();
 if(!saved)throw new ApiError(409,'Góp ý đã thay đổi. Đọc lại trước khi sửa.');
 return saved;
}
