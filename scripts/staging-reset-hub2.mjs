import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {runRemoteD1} from './d1-remote.mjs';
if(!process.argv.includes('--execute-staging')||!process.argv.includes('--manifest'))throw Error('Requires --execute-staging --manifest private-data/<QA manifest>. No production support.');
const file=process.argv[process.argv.indexOf('--manifest')+1],manifest=JSON.parse(readFileSync(file,'utf8'));
if(manifest.environment!=='staging'||!Array.isArray(manifest.learnerIds)||!manifest.learnerIds.length||manifest.learnerIds.some(id=>!/^qa-h5-[a-f0-9]{20}(-other)?$/.test(id)))throw Error('Only exact generated H5 QA learner IDs can be removed.');
const quote=x=>"'"+x.replaceAll("'","''")+"'",ids=manifest.learnerIds.map(quote).join(',');
// Dispose only generated test learning data; auth rows remain blocked for audit, never delete real users.
let sql=`UPDATE user SET status='blocked' WHERE id IN (${ids}); UPDATE session SET expires_at=0 WHERE user_id IN (${ids});\n`;
for(const table of ['disputes','attempt_diagnoses','grades'])sql+=`DELETE FROM ${table} WHERE ${table==='grades'?'attempt_id IN (SELECT id FROM attempts WHERE learner_id IN ('+ids+'))':'learner_id IN ('+ids+')'};\n`;
sql+=`DELETE FROM attempts WHERE learner_id IN (${ids}); DELETE FROM submissions WHERE learner_id IN (${ids}); DELETE FROM error_patterns WHERE learner_id IN (${ids}); DELETE FROM skill_states WHERE learner_id IN (${ids}); DELETE FROM lesson_items WHERE learner_id IN (${ids}); DELETE FROM learning_lessons WHERE user_id IN (${ids}); DELETE FROM ai_jobs WHERE learner_id IN (${ids}); DELETE FROM skills WHERE learner_id IN (${ids}); DELETE FROM subjects WHERE learner_id IN (${ids});\n`;
mkdirSync('private-data',{recursive:true});writeFileSync('private-data/h5-reset.sql',sql,{mode:0o600});runRemoteD1('staging','learning-hub-staging',['--file','private-data/h5-reset.sql']);console.log('Only named QA fixture data removed; QA identities blocked. Production untouched.');
