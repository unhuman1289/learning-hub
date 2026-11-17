import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function memoryDb({ through = "0036" } = {}){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f.slice(0,4)<=through).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const api={
  sqlite,
  prepare(sql){let params=[];const stmt={
   sql,get params(){return params;},
   bind(...values){params=values;return stmt;},
   async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}};},
   async first(){return sqlite.prepare(sql).get(...params)??null;},
   async all(){return {results:sqlite.prepare(sql).all(...params)};},
  };return stmt;},
  async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements){const q=sqlite.prepare(s.sql);if(q.columns().length)results.push({results:q.all(...s.params)});else results.push({meta:{changes:Number(q.run(...s.params).changes)}});}sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},
 };
 return api;
}
