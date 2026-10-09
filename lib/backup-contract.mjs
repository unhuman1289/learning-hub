export const backupColumns={
 learning_workspace:['owner','payload','revision','updated'],
 learning_lessons:['id','track','payload','assigned_date','completed_at','response','updated'],
 learning_slots:['track','lesson_id','revision'],
 learning_runs:['day','payload','updated'],
 runs:['id','day','status','started_at','finished_at','summary','error','origin','request_hash'],
 run_items:['run_id','user_id','track','outcome','reason','previous_lesson_id','lesson_id','sources'],
 backup_events:['id','created_at','created_by'],
 study_time:['user_id','day','track','seconds','updated'],
 learner_settings:['user_id','daily_target_minutes','updated'],
};
// Tables added after earlier exports were taken; an export without them still restores.
const laterTables=['study_time','learner_settings'];
export function buildRestoreSql(snapshot){
 if(![1,2].includes(snapshot.format)||!snapshot.tables)throw Error('Unsupported export');
 const literal=value=>{
   if(value===null)return 'NULL';
   if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
   if(typeof value==='string'&&!value.includes('\0'))return "'"+value.replaceAll("'","''")+"'";
   throw Error('Invalid cell in export');
 };
 const ids=new Set((snapshot.tables.learning_lessons??[]).map(row=>row.id));
 if((snapshot.tables.learning_slots??[]).some(row=>!ids.has(row.lesson_id)))throw Error('Export has missing lessons');
 const runIds=new Set((snapshot.tables.runs??[]).map(row=>row.id));
 if((snapshot.tables.run_items??[]).some(row=>!runIds.has(row.run_id)))throw Error('Export has missing runs');
 const sql=[];
 for(const [table,keys]of Object.entries(backupColumns)){
   const rows=snapshot.tables[table];
   if(snapshot.format===1&&rows===undefined&&['runs','run_items','backup_events'].includes(table))continue;
   if(rows===undefined&&laterTables.includes(table))continue;
   if(!Array.isArray(rows))throw Error('Missing table: '+table);
   for(const row of rows){
     if(keys.some(key=>!Object.hasOwn(row,key)))throw Error('Missing column in '+table);
     sql.push(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(key=>literal(row[key])).join(',')});`);
   }
 }
 return sql.join('\n')+'\n';
}
