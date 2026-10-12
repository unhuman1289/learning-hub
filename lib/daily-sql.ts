export function assignmentSql(x:{userId:string,track:string,expectedId:string|null,id:string,content:string,day:string,now:string,cutoff:string}) {
 const eligible=`(NOT EXISTS(SELECT 1 FROM learning_slots WHERE user_id=? AND track=?) AND ? IS NULL) OR EXISTS(SELECT 1 FROM learning_slots s JOIN learning_lessons l ON l.user_id=s.user_id AND l.id=s.lesson_id WHERE s.user_id=? AND s.track=? AND s.lesson_id=? AND l.completed_at IS NOT NULL AND l.completed_at<? AND l.assigned_date!=?)`;
 const eligibility=[x.userId,x.track,x.expectedId,x.userId,x.track,x.expectedId,x.cutoff,x.day];
 return [
  {sql:`INSERT OR IGNORE INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated) SELECT ?,?,?,?,?,NULL,'',? WHERE ${eligible}`,args:[x.id,x.userId,x.track,x.content,x.day,x.now,...eligibility]},
  {sql:`INSERT INTO learning_slots(user_id,track,lesson_id,revision) SELECT ?,?,?,0 WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE user_id=? AND id=?) AND (${eligible}) ON CONFLICT(user_id,track) DO UPDATE SET lesson_id=excluded.lesson_id,revision=learning_slots.revision+1`,args:[x.userId,x.track,x.id,x.userId,x.id,...eligibility]}
 ];
}
