import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runLocalD1} from './local-db.mjs';

// Only restore into a newly migrated, empty LOCAL database. This script has no
// remote mode and keeps generated SQL under the ignored private-data directory.
const file=resolve(process.argv[2]??'private-data/sites-export.json');
const snapshot=JSON.parse(readFileSync(file,'utf8'));
const columns={
  learning_workspace:['owner','payload','revision','updated'],
  learning_lessons:['id','track','payload','assigned_date','completed_at','response','updated'],
  learning_slots:['track','lesson_id','revision'],
  learning_runs:['day','payload','updated'],
};
if(snapshot.format!==1||!snapshot.tables)throw Error('Unsupported export');
const literal=value=>{
  if(value===null)return 'NULL';
  if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
  if(typeof value==='string'&&!value.includes('\0'))return "'"+value.replaceAll("'","''")+"'";
  throw Error('Invalid cell in export');
};
const ids=new Set((snapshot.tables.learning_lessons??[]).map(row=>row.id));
if((snapshot.tables.learning_slots??[]).some(row=>!ids.has(row.lesson_id)))throw Error('Export has missing lessons');
const sql=[];
for(const [table,keys]of Object.entries(columns)){
  const rows=snapshot.tables[table];
  if(!Array.isArray(rows))throw Error('Missing table: '+table);
  for(const row of rows){
    if(keys.some(key=>!Object.hasOwn(row,key)))throw Error('Missing column');
    sql.push(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(key=>literal(row[key])).join(',')});`);
  }
}
mkdirSync('private-data',{recursive:true});
const target=resolve('private-data/restore-local.sql');
writeFileSync(target,sql.join('\n')+'\n');
// Plain INSERT intentionally fails on duplicate primary keys: never overwrite
// an existing workspace or progress. Start with a fresh local DB for restoration.
runLocalD1(['execute','learning-hub','--file',target]);
console.log('Restored local export. Verify lesson IDs and progress before use.');
