import {runRemoteD1,parseWranglerRows} from './d1-remote.mjs';
const environment=process.argv[2]??'staging';if(!['staging','production'].includes(environment))throw Error('Explicit environment required');
const name=environment==='staging'?'learning-hub-staging':'learning-hub-prod';
const sql="SELECT j.id,j.learning_day,j.purpose,j.status,j.outcome,j.error FROM ai_jobs j JOIN user u ON u.id=j.learner_id LEFT JOIN subjects s ON s.id=j.subject_id WHERE lower(u.name)='unhuman' AND (s.legacy_track='Deutsch' OR (j.subject_id IS NULL AND json_extract(j.context_snapshot,'$.subjects[0].title')='Deutsch')) ORDER BY j.created_at DESC LIMIT 40";
const rows=parseWranglerRows(runRemoteD1(environment,name,['--command',sql]));
console.log(JSON.stringify({environment,jobs:rows.map(r=>{const out=r.outcome?JSON.parse(r.outcome):{};return {jobId:r.id,day:r.learning_day,purpose:r.purpose,status:r.status,lessonIds:[...new Set([...(out.extraLessonIds??[]),...(out.subjects??[]).flatMap(s=>s.lessonIds??[])])],unchanged:(out.subjects??[]).filter(s=>s.status==='no_action').length};}),nightAcceptance:'Requires receipts on 3 distinct Berlin days; this report does not infer user learning.'},null,2));
