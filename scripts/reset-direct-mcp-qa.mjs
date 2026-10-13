import {readFileSync,writeFileSync} from 'node:fs';
import {runRemoteD1} from './d1-remote.mjs';
import {spawnSync} from 'node:child_process';
const file=process.argv[2];if(!file)throw Error('Private staging QA manifest required.');
const m=JSON.parse(readFileSync(file,'utf8'));
if(m.environment!=='staging'||!m.learnerIds?.length||m.learnerIds.some(id=>!/^qa-h5-[a-f0-9]{20}(-other)?$/.test(id)))throw Error('Only generated staging QA identities.');
const ids=m.learnerIds.map(x=>"'"+x+"'").join(',');
// Retain public client metadata for audit. Revoke only generated identities.
const sql=`UPDATE oauthRefreshToken SET revoked=${Date.now()} WHERE userId IN (${ids});
UPDATE oauthAccessToken SET revoked=${Date.now()} WHERE userId IN (${ids});
DELETE FROM oauthConsent WHERE userId IN (${ids});`;
const path='private-data/direct-mcp-qa-revoke.sql';writeFileSync(path,sql,{mode:0o600});
runRemoteD1('staging','learning-hub-staging',['--file',path]);
const cleanup=spawnSync(process.execPath,['scripts/staging-reset-hub2.mjs','--execute-staging','--manifest',file],{stdio:'inherit'});
if(cleanup.status!==0)throw Error('QA learning cleanup failed.');
console.log('Generated QA OAuth grants revoked; existing learner identities/data untouched.');
