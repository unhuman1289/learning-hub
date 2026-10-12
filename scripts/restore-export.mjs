import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildRestoreSql} from '../lib/backup-contract.mjs';
import {runLocalD1} from './local-db.mjs';

// Only restore into a newly migrated, empty LOCAL database. This script has no
// remote mode and keeps generated SQL under the ignored private-data directory.
const file=resolve(process.argv[2]??'private-data/sites-export.json');
const snapshot=JSON.parse(readFileSync(file,'utf8'));
const args=Object.fromEntries(process.argv.slice(3).reduce((pairs,value,index,list)=>{if(value.startsWith('--'))pairs.push([value.slice(2),list[index+1]]);return pairs},[]));
const needsLegacyOwner=[...(snapshot.tables.learning_lessons??[]),...(snapshot.tables.learning_slots??[])].some(row=>!Object.hasOwn(row,'user_id'));
if(needsLegacyOwner&&!args['legacy-owner'])throw new Error('This legacy snapshot needs an existing local learner ID. Pass --legacy-owner <user-id>.');
const sql=buildRestoreSql(snapshot,{legacyOwnerId:args['legacy-owner']});
mkdirSync('private-data',{recursive:true});
const target=resolve('private-data/restore-local.sql');
writeFileSync(target,sql);
// Plain INSERT intentionally fails on duplicate primary keys: never overwrite
// an existing workspace or progress. Start with a fresh local DB for restoration.
runLocalD1(['execute','learning-hub','--file',target]);
console.log('Restored local export. Verify lesson IDs and progress before use.');
