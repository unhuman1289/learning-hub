import type { LearningTrack } from './daily-policy.ts';
import type { DailyLesson } from './daily-types.ts';
import { readBackupStatus } from './backup-store.ts';
import { readRunJournal, type JournalDb } from './run-journal.ts';

type Row={id:string,track:LearningTrack,payload:string,assigned_date:string,completed_at:string|null,response:string,updated:string};
function decode(row:Row):DailyLesson{return {id:row.id,track:row.track,content:JSON.parse(row.payload),assignedDate:row.assigned_date,completedAt:row.completed_at,response:row.response,updated:row.updated};}
const hiddenOperations={runs:[],health:{lastSuccessfulAt:null,stale:false,stalledRunId:null,latestFailed:false}};

export async function readDailyFor(db:JournalDb,userId:string,includeAdminOperations=false){
 if(!userId)throw new Error('A verified learner ID is required.');
 const active=await db.prepare('SELECT l.* FROM learning_lessons l JOIN learning_slots s ON s.user_id=l.user_id AND s.lesson_id=l.id WHERE l.user_id=? ORDER BY l.track').bind(userId).all<Row>();
 const history=await db.prepare('SELECT l.* FROM learning_lessons l WHERE l.user_id=? AND l.package_version=\'1\' AND NOT EXISTS (SELECT 1 FROM learning_slots s WHERE s.user_id=l.user_id AND s.lesson_id=l.id) ORDER BY l.assigned_date DESC,l.track LIMIT 100').bind(userId).all<Row>();
 const run=includeAdminOperations?await db.prepare('SELECT day,payload,updated FROM learning_runs ORDER BY day DESC LIMIT 1').first<{day:string,payload:string,updated:string}>():null;
 const operations=includeAdminOperations?await readRunJournal(db):hiddenOperations;
 return {
  active:active.results.map(decode),history:history.results.map(decode),
  lastRun:run?{day:run.day,updated:run.updated,summary:JSON.parse(run.payload)}:null,
  ...operations,
  backup:includeAdminOperations?await readBackupStatus(db):{lastCreatedAt:null,due:false},
 };
}
