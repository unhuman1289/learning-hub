/** Restore inserts in this order, so parent rows (subjects, lessons) exist before their children. */
export const backupColumns={
 learning_workspace:['owner','payload','revision','updated'],
 learner_settings:['user_id','daily_target_minutes','updated','role','display_name','explain_language','preferences','ai_budget','personal_prompt','avatar','tutor_enabled'],
 guardians:['guardian_id','learner_id','created_by','created_at'],
 subjects:['id','learner_id','title','template','sensitivity','goal','level','curriculum','limits','weight','status','ai_enabled','legacy_track','system_kind','instructions','opening_brief','knowledge_freshness_days','framework','topic_key','roadmap_replan','progress_summary','roadmap','progress_updated_at','revision','created_by','created_at','updated_at'],
 ai_subject_controls:['subject_id','openai_enabled','tts_enabled','updated_by','updated_at'],
 ai_control_log:['id','subject_id','field','old_value','new_value','changed_by','changed_at'],
 ai_control_initialization:['id','initialized_at'],
 ai_speech_calls:['hash','openai_calls'],
 calibration_jobs:['id','kind','status','calls','schedule_key','lease_token','lease_expires_at','error','created_at','updated_at','finished_at'],
 grader_calibrations:['id','model','prompt_hash','set_hash','n','agreement','evidence_not_verbatim','injection_shifted','mean_ms','input_tokens','output_tokens','created_at'],
 roadmap_steps:['id','learner_id','subject_id','ord','title','objective','situation','skill_ids','requires','band','level_label','kind','status','passed_via','origin','origin_job_id','opened_at','passed_at','retired_reason','created_at','updated_at','revision','listening'],
 skills:['id','subject_id','learner_id','key','name','description','path_order','prerequisites','status','origin','created_at','updated_at'],
 learning_lessons:['id','user_id','track','payload','assigned_date','completed_at','response','updated','automation_reviewed_at','subject_id','package_version','template','kind','slot','reason','reason_refs','est_minutes','draft','draft_revision','support','snoozed_until','origin_job_id','roadmap_step_id','step_role','listen_log'],
 learning_slots:['user_id','track','lesson_id','revision'],
 attachments:['id','learner_id','attempt_id','r2_key','mime','bytes','width','height','sha256','created_at','expires_at','deleted_at'],
 audio_assets:['hash','lang','rate','voices','duration_ms','bytes','r2_key','created_job_id','created_at'],
 lesson_items:['lesson_id','item_id','learner_id','subject_id','stage','activity','input_kind','skill_ids','difficulty','auto_gradable','prompt_hash','origin','payload','flag','created_at','stimulus','audio_hash_f','audio_hash_m'],
 tutor_turns:['id','lesson_id','item_id','learner_id','question','answer','status','leak_blocked','first_token_ms','created_at','answered_at','input_tokens','output_tokens','attempt_token','lease_expires_at','openai_calls'],
 learner_requests:['id','learner_id','subject_id','kind','text','urgency','created_by','status','active_until','result_lesson_id','response_note','job_id','created_at','processed_at','metadata'],
 submissions:['id','learner_id','lesson_id','stage','client_submission_id','request_hash','status','ai_job_id','created_at','graded_at'],
 attempts:['id','submission_id','learner_id','lesson_id','item_id','subject_id','skill_ids','activity','attempt_no','retry_of','answer','attachment_ids','support','context','status','current_grade_id','day','created_at','stimulus'],
 grades:['id','attempt_id','grader','job_id','result','score','rubric_scores','feedback','correction','errors','superseded_by','created_at'],
 disputes:['id','attempt_id','grade_id','learner_id','raised_by','reason','message','recheck_requested','status','resolution_grade_id','resolved_by','resolution_note','created_at','resolved_at'],
 lesson_reflections:['submission_id','learner_id','lesson_id','subject_id','difficulty','usefulness','minutes','note','revision','created_at','updated_at'],
 skill_states:['skill_id','learner_id','subject_id','mastery','mastery_ceiling','mastery_source','mastery_reason','dim_knowledge','dim_recognition','dim_application','dim_retention','exposure','recent_exposure','stuck_on','attempts_total','last_attempt_at','last_independent_at','review_interval_days','next_review_day','review_kind','review_step_day','maintained','review_source','evidence_hash','recompute_token','updated_at','revision','listening'],
 error_patterns:['id','learner_id','subject_id','skill_id','label','label_norm','category','confidence','status','occurrences','days_seen','example_attempt_ids','intervention','first_seen_at','last_seen_at','resolved_at'],
 ai_jobs:['id','kind','purpose','trigger','learner_id','subject_id','ref_id','learning_day','priority','status','dedupe_key','lease_client_id','lease_token_sha256','lease_expires_at','lease_count','context_hash','context_snapshot','result_hash','outcome','usage','validation_failures','error','runner','created_at','updated_at','finished_at','expires_at','apply_token','cost_usd','needs_vision','adaptive','openai_calls','speech_calls'],
 alert_events:['id','learning_day','code','message','created_at','email_state','sent_at'],
 attempt_diagnoses:['id','attempt_id','job_id','learner_id','errors','created_at'],
 ai_apply_guards:['token','valid'],
 learning_runs:['day','payload','updated'],
 runs:['id','day','status','started_at','finished_at','summary','error','origin','request_hash'],
 legacy_run_items:['run_id','user_id','track','outcome','reason','previous_lesson_id','lesson_id','sources'],
 automation_runs:['id','client_id','contract_version','trigger','runner_name','runner_version','runner_model','idempotency_key','request_hash','status','created_at','expires_at','context_hash','context_json','result_hash','result_json','finished_at','error'],
 run_targets:['run_id','target_id','user_id','track','current_lesson_id','eligible','eligibility','context_json'],
 run_items:['run_id','target_id','action','outcome','reason','lesson_id','payload'],
 run_events:['id','run_id','occurred_at','type','detail'],
 backup_events:['id','created_at','created_by'],
 perf_daily:['day','screen','country','device','n','p50','p75','p95'],
 perf_counts:['day','screen','country','device','ms','n'],
 study_time:['user_id','day','track','seconds','updated'],
 knowledge_versions:['seq','id','status','parent_seq','created_by','reason','check_report','created_at','activated_at'],
 knowledge_sources:['id','url','title','publisher','issuer','source_type','published_at','version_label','retrieved_at','read_scope','jurisdiction','applies_in_germany','language','evidence_note','added_seq','removed_seq','superseded_by','created_by'],
 knowledge_notes:['id','source_id','heading','body','quote','added_seq','removed_seq'],
 knowledge_links:['note_id','subject_id','skill_key','added_seq','removed_seq','topic_key'],
 knowledge_terms:['note_id','term','weight'],
 knowledge_gaps:['id','subject_id','question','why_missing','origin','job_id','priority','status','dedupe_hash','seen_count','resolved_seq','resolution_note','created_at','resolved_at','topic_key','step_id'],
 knowledge_probes:['id','subject_id','query','expect_source_id','gap_id','top_k','created_by','added_seq','removed_seq','topic_key'],
 knowledge_changes:['id','version_seq','action','target_id','reason','client_id','client_change_id','request_hash','created_at'],
};

/** Tables and columns added after format 3 shipped; older snapshots restore with these defaults. */
const optionalTables=['calibration_jobs','grader_calibrations','ai_subject_controls','ai_control_log','ai_control_initialization','ai_speech_calls','tutor_turns','audio_assets','perf_daily','perf_counts','roadmap_steps','knowledge_versions','knowledge_sources','knowledge_notes','knowledge_links','knowledge_terms','knowledge_gaps','knowledge_probes','knowledge_changes','lesson_reflections','attempt_diagnoses','ai_apply_guards','ai_jobs','alert_events','skill_states','error_patterns','submissions','attempts','grades','disputes','study_time','learner_settings','guardians','subjects','skills','learner_requests','lesson_items','attachments'];
const columnDefaults={
 tutor_turns:{openai_calls:0,input_tokens:null,output_tokens:null,attempt_token:null,lease_expires_at:null},
 roadmap_steps:{listening:0},
 lesson_items:{stimulus:'text',audio_hash_f:null,audio_hash_m:null},
 attempts:{stimulus:'text'},
 knowledge_links:{topic_key:null}, knowledge_gaps:{topic_key:null,step_id:null}, knowledge_probes:{topic_key:null},
 learner_requests:{metadata:null},

 learner_settings:{role:'adult',display_name:null,explain_language:'vi',preferences:'{}',ai_budget:null,personal_prompt:'',avatar:'',tutor_enabled:1},
 // Lessons from format 1–3 are legacy lessons; their notebook is filled in by a trigger on insert.
 skill_states:{listening:null,review_source:'rules'},
 subjects:{framework:null,topic_key:null,roadmap_replan:0,knowledge_freshness_days:null,system_kind:null,roadmap:'[]',instructions:'',opening_brief:null},
  ai_jobs:{needs_vision:0,adaptive:0,openai_calls:0,speech_calls:0},
 learning_lessons:{listen_log:'{}',step_role:null,roadmap_step_id:null,subject_id:null,package_version:'1',template:null,kind:'legacy',slot:'primary',reason:'',reason_refs:'[]',est_minutes:null,draft:'{}',draft_revision:0,support:'{}',snoozed_until:null,origin_job_id:null},
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

export function snapshotCell(table,row,key,legacyOwnerId){
   if(Object.hasOwn(row,key))return row[key];
   if(key==='user_id'&&['learning_lessons','learning_slots'].includes(table)&&typeof legacyOwnerId==='string'&&legacyOwnerId.length)return legacyOwnerId;
   if(key==='automation_reviewed_at'&&table==='learning_lessons')return null;
   if(Object.hasOwn(columnDefaults[table]??{},key))return columnDefaults[table][key];
   return undefined;
}

export function buildRestoreSql(snapshot,{legacyOwnerId}={}){
 if(![1,2,3,4].includes(snapshot.format)||!snapshot.tables)throw Error('Unsupported export');
 const literal=value=>{
   if(value===null)return 'NULL';
   if(typeof value==='number'&&Number.isFinite(value))return String(value);
   if(typeof value==='string'&&!value.includes('\0'))return "'"+value.replaceAll("'","''")+"'";
   throw Error('Invalid cell in export');
 };
 const ids=new Set((snapshot.tables.learning_lessons??[]).map(row=>row.id));
 if((snapshot.tables.learning_slots??[]).some(row=>!ids.has(row.lesson_id)))throw Error('Export has missing lessons');
 const runIds=new Set((snapshot.tables.runs??[]).map(row=>row.id));
 const legacyItems=snapshot.tables.legacy_run_items??(snapshot.format<3?snapshot.tables.run_items??[]:[]);
 if(legacyItems.some(row=>!runIds.has(row.run_id)))throw Error('Export has missing runs');
 const automationRunIds=new Set((snapshot.tables.automation_runs??[]).map(row=>row.id));
 if((snapshot.tables.run_events??[]).some(row=>!automationRunIds.has(row.run_id)))throw Error('Export has missing automation runs');
 const sql=[],links=[];
 for(const [table,keys]of Object.entries(backupColumns)){
   let rows=snapshotRowsForTarget(snapshot,table);
   if(rows===undefined){
     if(snapshot.format<3&&['backup_events','runs','legacy_run_items'].includes(table))continue;
     throw Error('Missing table: '+table);
   }
   if(!Array.isArray(rows))throw Error('Invalid table: '+table);
   for(const row of rows){
     // A regraded grade points forward to its replacement; link it once every grade exists.
     const values=keys.map(key=>table==='grades'&&key==='superseded_by'?null:snapshotCell(table,row,key,legacyOwnerId));
     if(values.some(value=>value===undefined))throw Error('Missing column in '+table);
     sql.push(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${values.map(literal).join(',')});`);
     if(table==='grades'&&row.superseded_by!=null)links.push(`UPDATE grades SET superseded_by=${literal(row.superseded_by)} WHERE id=${literal(row.id)};`);
   }
 }
 return [...sql,...links].join('\n')+'\n';
}
