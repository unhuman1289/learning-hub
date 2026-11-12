import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { stage, upsertSource, addProbe, activate, rollback, contextExcerpt } from '../lib/knowledge/service.ts';

const client={clientId:'maintainer'};
const subjectId='sub_aaaaaaaaaaaaaaaaaaaa';
const source={url:'https://example.org/grammar',title:'German subordinate clauses',publisher:'Grammar institute',
  sourceType:'official_doc',retrievedAt:'2026-11-12T12:00:00Z',readScope:'full',language:'de'};
function database() {
  const db=memoryDb();
  db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,'ech','Deutsch','skill','active','ly','t','t')").run(subjectId);
  return db;
}
function input(versionId,key='source') {
  return {versionId,clientChangeId:key,source,notes:[{heading:'Nebensatz',body:'Das Verb steht am Ende des Nebensatzes.'}],links:[{subjectId}]};
}
test('staged notes stay hidden, probes gate activation, duplicate writes replay, and rollback isolates a failed fork',async()=>{
  const db=database(), one=await stage(db,client,'Erste Quellen');
  const data=input(one.id);
  const first=await upsertSource(db,client,data);
  assert.deepEqual(await upsertSource(db,client,data),{sourceId:first.sourceId,replayed:true});
  assert.equal(await contextExcerpt(db,{subjectId,query:'Nebensatz'}),undefined);
  await addProbe(db,client,{versionId:one.id,subjectId,query:'Nebensatz',expectSourceId:first.sourceId,clientChangeId:'probe1'});
  assert.equal((await activate(db,client,one.id)).status,'active');
  assert.equal((await contextExcerpt(db,{subjectId,query:'Nebensatz'})).notes[0].sourceId,first.sourceId);
  const two=await stage(db,client,'Update');
  const second=await upsertSource(db,client,input(two.id,'second'));
  assert.equal((await activate(db,client,two.id)).status,'active');
  const three=await stage(db,client,'Bad update');
  await addProbe(db,client,{versionId:three.id,subjectId,query:'unrelatedword',expectSourceId:second.sourceId,clientChangeId:'probe3'});
  assert.equal((await activate(db,client,three.id)).status,'failed');
  assert.equal((await contextExcerpt(db,{subjectId,query:'Nebensatz'})).versionSeq,two.seq);
  await rollback(db,client,one.seq,'Return to prior version');
  const after=await stage(db,client,'New branch');
  assert.equal((await activate(db,client,after.id)).status,'active');
  assert.deepEqual((await contextExcerpt(db,{subjectId,query:'Nebensatz'})).notes.map(note=>note.sourceId),[first.sourceId]);
  assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  db.sqlite.close();
});
test('invalid sources and clinical identifiers are refused',async()=>{
  const db=database(), v=await stage(db,client,'New source');
  const data=input(v.id);
  await assert.rejects(upsertSource(db,client,{...data,source:{...source,url:'http://example.org'}}),{status:422});
  await assert.rejects(upsertSource(db,client,{...data,source:{...source,sourceType:'guideline',url:'https://arxiv.org/abs/1'}}),{status:422});
  await assert.rejects(upsertSource(db,client,{...data,notes:[{heading:'Example',body:'Patient: Jane Doe'}]}),{status:422});
  db.sqlite.prepare("UPDATE subjects SET sensitivity='clinical' WHERE id=?").run(subjectId);
  await assert.rejects(upsertSource(db,client,data),{status:422});
  db.sqlite.close();
});

import {deprecateSource,listGaps,recordGap,resolveGap} from '../lib/knowledge/service.ts';
test('gaps dedupe, require a passed linked probe, and source replacement preserves inherited probes',async()=>{
 const db=database();
 const data={subjectId,question:'Nebensatz?',why:'Need an official example',origin:'admin',priority:'normal'};
 const gap=await recordGap(db,data);
 assert.equal((await recordGap(db,{...data,question:'NÉBENSATZ',priority:'high'})).id,gap.id);
 assert.equal((await listGaps(db))[0].seen_count,2);
 const v=await stage(db,client,'First');
 const first=await upsertSource(db,client,input(v.id));
 await addProbe(db,client,{versionId:v.id,subjectId,query:'Nebensatz',expectSourceId:first.sourceId,clientChangeId:'gap-probe',gapId:gap.id});
 assert.equal((await activate(db,client,v.id)).status,'active');
 await resolveGap(db,client,{gapId:gap.id,status:'resolved',versionSeq:v.seq,note:'Probe passed',clientChangeId:'close-gap'});
 assert.equal((await listGaps(db,'resolved')).length,1);
 const next=await stage(db,client,'Replace');
 const second=await upsertSource(db,client,input(next.id,'replace'));
 await deprecateSource(db,client,{versionId:next.id,sourceId:first.sourceId,supersededBy:second.sourceId,reason:'New revision',clientChangeId:'deprecate'});
 assert.equal((await activate(db,client,next.id)).status,'active');
 assert.deepEqual((await contextExcerpt(db,{subjectId,query:'Nebensatz'})).notes.map(note=>note.sourceId),[second.sourceId]);
 db.sqlite.close();
});

import {backupColumns,buildRestoreSql} from '../lib/backup-contract.mjs';
test('knowledge backup restores active lineage and retrieval indexes without losing old sources',async()=>{
 const db=database(), v=await stage(db,client,'Restore fixture');
 const entry=await upsertSource(db,client,input(v.id));
 await addProbe(db,client,{versionId:v.id,subjectId,query:'Nebensatz',expectSourceId:entry.sourceId,clientChangeId:'probe'});
 assert.equal((await activate(db,client,v.id)).status,'active');
 const tables=Object.fromEntries(Object.entries(backupColumns).map(([table,columns])=>[
   table,db.sqlite.prepare('SELECT '+columns.join(',')+' FROM '+table).all(),
 ]));
 const restored=memoryDb();
 const restore=buildRestoreSql({format:4,tables});
 restored.sqlite.exec(Array.isArray(restore)?restore.join('\n'):restore);
 assert.deepEqual(restored.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await contextExcerpt(restored,{subjectId,query:'Nebensatz'})).notes[0].sourceId,entry.sourceId);
 assert.equal(await contextExcerpt(restored,{subjectId,query:'Nebensatz',maxBytes:32}),undefined);
 restored.sqlite.close();db.sqlite.close();
});
