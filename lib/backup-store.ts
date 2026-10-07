import {backupColumns} from './backup-contract.mjs';
import type {JournalDb} from './run-journal.ts';
export async function createBackup(db:JournalDb,userId:string,now=new Date()){
 const id=crypto.randomUUID(),createdAt=now.toISOString();
 const tables=Object.keys(backupColumns);
 // D1 batch is a transaction: exported tables describe one consistent snapshot.
 const results=await db.batch([
   db.prepare('INSERT INTO backup_events(id,created_at,created_by) VALUES(?,?,?)').bind(id,createdAt,userId),
   ...tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`)),
 ]) as {results?:Record<string,unknown>[]}[];
 if(results.length!==tables.length+1||tables.some((_,index)=>!Array.isArray(results[index+1]?.results)))throw Error('Incomplete backup query results');
 return {format:2,projectId:'appgprj_6ac5fd4aa4a8819188c4fabae021727f',exportedAt:createdAt,backupId:id,tables:Object.fromEntries(tables.map((table,index)=>[table,results[index+1].results!]))};
}
export async function readBackupStatus(db:JournalDb,now=new Date()){
 const row=await db.prepare('SELECT created_at FROM backup_events ORDER BY created_at DESC LIMIT 1').first<{created_at:string}>();
 return {lastCreatedAt:row?.created_at??null,due:!row||now.getTime()-Date.parse(row.created_at)>7*86400000};
}
