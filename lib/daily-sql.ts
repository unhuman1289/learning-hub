export function assignmentSql(x:{track:string,expectedId:string|null,id:string,content:string,day:string,now:string,cutoff:string}) {
 const eligible=`(NOT EXISTS(SELECT 1 FROM learning_slots WHERE track=?) AND ? IS NULL) OR EXISTS(SELECT 1 FROM learning_slots s JOIN learning_lessons l ON l.id=s.lesson_id WHERE s.track=? AND s.lesson_id=? AND l.completed_at IS NOT NULL AND l.completed_at<? AND l.assigned_date!=?)`;
 const eligibility=[x.track,x.expectedId,x.track,x.expectedId,x.cutoff,x.day];
 return [
  {sql:`INSERT OR IGNORE INTO learning_lessons(id,track,payload,assigned_date,completed_at,response,updated) SELECT ?,?,?,?,NULL,'',? WHERE ${eligible}`,args:[x.id,x.track,x.content,x.day,x.now,...eligibility]},
  {sql:`INSERT INTO learning_slots(track,lesson_id,revision) SELECT ?,?,0 WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=?) AND (${eligible}) ON CONFLICT(track) DO UPDATE SET lesson_id=excluded.lesson_id,revision=learning_slots.revision+1`,args:[x.track,x.id,x.id,...eligibility]}
 ];
}
