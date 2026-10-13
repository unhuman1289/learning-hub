/** Restore inserts in this order, so parent rows (subjects, lessons) exist before their children. */
export const backupColumns={
 learning_workspace:['owner','payload','revision','updated'],
 learner_settings:['user_id','daily_target_minutes','updated','role','display_name','explain_language','preferences','ai_budget'],
 guardians:['guardian_id','learner_id','created_by','created_at'],
 subjects:['id','learner_id','title','template','sensitivity','goal','level','curriculum','limits','weight','status','ai_enabled','legacy_track','progress_summary','progress_updated_at','revision','created_by','created_at','updated_at'],
 skills:['id','subject_id','learner_id','key','name','description','path_order','prerequisites','status','origin','created_at','updated_at'],
 learning_lessons:['id','user_id','track','payload','assigned_date','completed_at','response','updated','automation_reviewed_at','subject_id','package_version','template','kind','slot','reason','reason_refs','est_minutes','draft','draft_revision','support','snoozed_until','origin_job_id'],
 learning_slots:['user_id','track','lesson_id','revision'],
 attachments:['id','learner_id','attempt_id','r2_key','mime','bytes','width','height','sha256','created_at','expires_at','deleted_at'],
 lesson_items:['lesson_id','item_id','learner_id','subject_id','stage','activity','input_kind','skill_ids','difficulty','auto_gradable','prompt_hash','origin','payload','flag','created_at'],
 learner_requests:['id','learner_id','subject_id','kind','text','urgency','created_by','status','active_until','result_lesson_id','response_note','job_id','created_at','processed_at'],
 learning_runs:['day','payload','updated'],
 runs:['id','day','status','started_at','finished_at','summary','error','origin','request_hash'],
 legacy_run_items:['run_id','user_id','track','outcome','reason','previous_lesson_id','lesson_id','sources'],
 automation_runs:['id','client_id','contract_version','trigger','runner_name','runner_version','runner_model','idempotency_key','request_hash','status','created_at','expires_at','context_hash','context_json','result_hash','result_json','finished_at','error'],
 run_targets:['run_id','target_id','user_id','track','current_lesson_id','eligible','eligibility','context_json'],
 run_items:['run_id','target_id','action','outcome','reason','lesson_id','payload'],
 run_events:['id','run_id','occurred_at','type','detail'],
 backup_events:['id','created_at','created_by'],
 study_time:['user_id','day','track','seconds','updated'],
};

/** Tables and columns added after format 3 shipped; older snapshots restore with these defaults. */
const optionalTables=['study_time','learner_settings','guardians','subjects','skills','learner_requests','lesson_items','attachments'];
const columnDefaults={
 learner_settings:{role:'adult',display_name:null,explain_language:'vi',preferences:'{}',ai_budget:null},
 // Lessons from format 1–3 are legacy lessons; their notebook is filled in by a trigger on insert.
 learning_lessons:{subject_id:null,package_version:'1',template:null,kind:'legacy',slot:'primary',reason:'',reason_refs:'[]',est_minutes:null,draft:'{}',draft_revision:0,support:'{}',snoozed_until:null,origin_job_id:null},
};

export function restoreTargetTable(snapshot,table){
 if(snapshot.format<3&&table==='run_items')return 'legacy_run_items';
 return table;
}

export function snapshotRowsForTarget(snapshot,targetTable){
 if(targetTable==='legacy_run_items')return snapshot.tables.legacy_run_items??(snapshot.format<3?snapshot.tables.run_items:undefined);
 if(snapshot.format<3&&['automation_runs','run_targets','run_items','run_events'].includes(targetTable))return [];
 if(optionalTables.includes(targetTable)&&snapshot.tables[targetTable]===undefined)return [];
 return snapshot.tables[targetTable];
}

export function columnsForSnapshotTable(snapshot,sourceTable){
 return backupColumns[restoreTargetTable(snapshot,sourceTable)];
}

export function buildRestoreSql(snapshot,{legacyOwnerId}={}){
 if(![1,2,3,4].includes(snapshot.format)||!snapshot.tables)throw Error('Unsupported export');
 const literal=value=>{
   if(value===null)return 'NULL';
   if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
   if(typeof value==='string'&&!value.includes('\0'))return "'"+value.replaceAll("'","''")+"'";
   throw Error('Invalid cell in export');
 };
 const rowValue=(table,row,key)=>{
   if(Object.hasOwn(row,key))return row[key];
   if(key==='user_id'&&['learning_lessons','learning_slots'].includes(table)&&typeof legacyOwnerId==='string'&&legacyOwnerId.length)return legacyOwnerId;
   if(key==='automation_reviewed_at'&&table==='learning_lessons')return null;
   if(Object.hasOwn(columnDefaults[table]??{},key))return columnDefaults[table][key];
   return undefined;
 };
 const ids=new Set((snapshot.tables.learning_lessons??[]).map(row=>row.id));
 if((snapshot.tables.learning_slots??[]).some(row=>!ids.has(row.lesson_id)))throw Error('Export has missing lessons');
 const runIds=new Set((snapshot.tables.runs??[]).map(row=>row.id));
 const legacyItems=snapshot.tables.legacy_run_items??(snapshot.format<3?snapshot.tables.run_items??[]:[]);
 if(legacyItems.some(row=>!runIds.has(row.run_id)))throw Error('Export has missing runs');
 const automationRunIds=new Set((snapshot.tables.automation_runs??[]).map(row=>row.id));
 if((snapshot.tables.run_events??[]).some(row=>!automationRunIds.has(row.run_id)))throw Error('Export has missing automation runs');
 const sql=[];
 for(const [table,keys]of Object.entries(backupColumns)){
   let rows=snapshotRowsForTarget(snapshot,table);
   if(rows===undefined){
     if(snapshot.format<3&&['backup_events','runs','legacy_run_items'].includes(table))continue;
     throw Error('Missing table: '+table);
   }
   if(!Array.isArray(rows))throw Error('Invalid table: '+table);
   for(const row of rows){
     const values=keys.map(key=>rowValue(table,row,key));
     if(values.some(value=>value===undefined))throw Error('Missing column in '+table);
     sql.push(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${values.map(literal).join(',')});`);
   }
 }
 return sql.join('\n')+'\n';
}
