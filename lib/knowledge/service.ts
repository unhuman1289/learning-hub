import { ApiError } from '../api-error.ts';
import type { EvidenceDb as Db } from '../evidence/submit.ts';
import { parse, requirePublicText, sourceInput, text, validateSource } from './policy.ts';
import { terms } from './terms.ts';

export type KnowledgePrincipal = { clientId: string };
type Version = { seq: number; id: string; status: string; parent_seq: number | null; created_by: string; created_at: string };
const lineage = `WITH RECURSIVE lineage(seq) AS (
  SELECT seq FROM knowledge_versions WHERE seq=?
  UNION ALL SELECT v.parent_seq FROM knowledge_versions v JOIN lineage l ON l.seq=v.seq WHERE v.parent_seq IS NOT NULL
)`;
const visibleSource = `s.added_seq IN (SELECT seq FROM lineage)
  AND NOT EXISTS (SELECT 1 FROM knowledge_changes c JOIN lineage v ON v.seq=c.version_seq
    WHERE c.action IN ('deprecate','update_source') AND c.target_id=s.id)`;
const version = (db: Db, id: string) => db.prepare('SELECT * FROM knowledge_versions WHERE id=?').bind(id).first<Version>();
const active = (db: Db) => db.prepare("SELECT * FROM knowledge_versions WHERE status='active'").bind().first<Version>();
const conflict = (message: string) => new ApiError(409, message);

async function expire(db: Db) {
  await db.prepare("UPDATE knowledge_versions SET status='failed', check_report=? WHERE status='staged' AND created_at<=?")
    .bind('{"reason":"expired"}', new Date(Date.now()-6*3600000).toISOString()).run();
}

export async function stage(db: Db, principal: KnowledgePrincipal, reason: unknown) {
  const message = parse(text(300), reason);
  requirePublicText([message]);
  await expire(db);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO knowledge_versions(id,status,parent_seq,created_by,reason,created_at)
    VALUES(?,'staged',(SELECT seq FROM knowledge_versions WHERE status='active'),?,?,?)`)
    .bind(id, principal.clientId, message, now).run();
  return db.prepare("SELECT * FROM knowledge_versions WHERE status='staged' AND created_by=?")
    .bind(principal.clientId).first<Version>();
}

async function ownedStage(db: Db, principal: KnowledgePrincipal, id: string) {
  await expire(db);
  const v = await version(db, id);
  if (!v || v.created_by !== principal.clientId || v.status !== 'staged')
    throw conflict('Bản nháp đã đóng hoặc không thuộc kết nối này.');
  return v;
}

async function replay(db: Db, principal: KnowledgePrincipal, key: string, value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  const row = await db.prepare('SELECT target_id,request_hash FROM knowledge_changes WHERE client_id=? AND client_change_id=?')
    .bind(principal.clientId, key).first<{target_id: string; request_hash: string}>();
  if (row && row.request_hash !== hash) throw conflict('Mã thay đổi đã được dùng cho dữ liệu khác.');
  return { hash, target: row?.target_id };
}

export async function scoreNotes(db: Db, query: string, subjectId: string, seq: number, k: number) {
  const keys = terms(query, 32);
  if (!keys.length) return [];
  const { results = [] } = await db.prepare(`${lineage}
    SELECT n.id,n.heading,n.body,s.id AS sourceId,s.url,s.title,s.publisher,s.published_at,s.read_scope,
      sum(t.weight) AS score
    FROM knowledge_terms t JOIN knowledge_notes n ON n.id=t.note_id JOIN knowledge_sources s ON s.id=n.source_id
    WHERE ${visibleSource} AND t.term IN (SELECT value FROM json_each(?))
      AND EXISTS(SELECT 1 FROM knowledge_links l WHERE l.note_id=n.id AND l.subject_id=?)
    GROUP BY n.id ORDER BY score DESC,s.retrieved_at DESC,n.id LIMIT ?`)
    .bind(seq, JSON.stringify(keys), subjectId, Math.max(1,Math.min(20,k))).all<{
      id: string; heading: string; body: string; sourceId: string; url: string; title: string;
      publisher: string; published_at: string | null; read_scope: string; score: number;
    }>();
  return results;
}

export async function contextExcerpt(db: Db, {subjectId, query, maxBytes = 4096}: {subjectId: string; query: string; maxBytes?: number}) {
  const current = await active(db);
  if (!current) return undefined;
  const notes = await scoreNotes(db, query, subjectId, current.seq, 6);
  const excerpt = { versionSeq: current.seq, notes: [] as typeof notes };
  for (const note of notes) {
    const next = { ...excerpt, notes: [...excerpt.notes, note] };
    if (new TextEncoder().encode(JSON.stringify(next)).length <= Math.min(maxBytes,4096)) excerpt.notes.push(note);
  }
  return excerpt.notes.length ? excerpt : undefined;
}

export async function upsertSource(db: Db, principal: KnowledgePrincipal, input: unknown) {
  const data = parse(sourceInput,input);
  const checked = await replay(db,principal,data.clientChangeId,data);
  if (checked.target) return { sourceId: checked.target, replayed: true };
  const v = await ownedStage(db,principal,data.versionId);
  const source = data.source;
  requirePublicText([source.url,source.title,source.publisher,source.issuer,source.versionLabel,source.evidenceNote,
    ...data.notes.flatMap(note => [note.heading,note.body,note.quote]),...data.links.map(link=>link.skillKey)]);
  const subjects = [...new Set(data.links.map(link=>link.subjectId))];
  const {results: matching=[]} = await db.prepare("SELECT id,sensitivity,title,legacy_track FROM subjects WHERE status<>'archived' AND id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(subjects)).all<{sensitivity:string;title:string;legacy_track:string|null}>();
  if (matching.length !== subjects.length) throw new ApiError(422,'Có sổ không tồn tại hoặc đã lưu trữ.');
  validateSource(source, matching.some(row=>row.sensitivity==='clinical' || /\b(?:MTB|Cardio|PGx|Onco)\b/i.test(row.legacy_track ?? row.title)));
  const now = new Date().toISOString(), sourceId = crypto.randomUUID(), change = crypto.randomUUID();
  const gate = 'EXISTS(SELECT 1 FROM knowledge_changes WHERE id=?)';
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO knowledge_changes
      SELECT ?,?,'add_source',?,'',?,?,?,?
      WHERE EXISTS(SELECT 1 FROM knowledge_versions WHERE seq=? AND status='staged')
        AND (SELECT count(*) FROM knowledge_sources WHERE added_seq=?)<20
        AND (SELECT count(*) FROM knowledge_notes WHERE added_seq=?)+?<=120`)
      .bind(change,v.seq,sourceId,principal.clientId,data.clientChangeId,checked.hash,now,v.seq,v.seq,v.seq,data.notes.length),
    db.prepare(`INSERT INTO knowledge_sources
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,? WHERE ${gate}`)
      .bind(sourceId,source.url,source.title,source.publisher,source.issuer??null,source.sourceType,
        source.publishedAt??null,source.versionLabel??null,source.retrievedAt,source.readScope,
        source.jurisdiction??null,source.appliesInGermany??null,source.language,source.evidenceNote??null,v.seq,principal.clientId,change),
  ];
  const notes = data.notes.map(note=>({...note,id:crypto.randomUUID()}));
  statements.push(
    db.prepare(`INSERT INTO knowledge_notes SELECT json_extract(value,'$.id'),?,json_extract(value,'$.heading'),
      json_extract(value,'$.body'),json_extract(value,'$.quote'),?,NULL FROM json_each(?) WHERE ${gate}`)
      .bind(sourceId,v.seq,JSON.stringify(notes),change),
    db.prepare(`INSERT INTO knowledge_links SELECT json_extract(n.value,'$.id'),json_extract(l.value,'$.subjectId'),
      json_extract(l.value,'$.skillKey'),?,NULL FROM json_each(?) n CROSS JOIN json_each(?) l WHERE ${gate}`)
      .bind(v.seq,JSON.stringify(notes),JSON.stringify(data.links),change),
    db.prepare(`INSERT INTO knowledge_terms SELECT json_extract(n.value,'$.id'),t.value,
      CASE WHEN t.value IN (SELECT value FROM json_each(json_extract(n.value,'$.heading'))) THEN 3 ELSE 1 END
      FROM json_each(?) n CROSS JOIN json_each(json_extract(n.value,'$.terms')) t WHERE ${gate}`)
      .bind(JSON.stringify(notes.map(n=>({id:n.id,heading:terms(n.heading),terms:terms(n.heading+' '+n.body)}))),change),
  );
  await db.batch(statements);
  const saved = await replay(db,principal,data.clientChangeId,data);
  if (!saved.target) throw conflict('Bản nháp đã đổi hoặc đã đạt giới hạn nguồn hay ghi chú.');
  return {sourceId:saved.target,replayed:saved.target!==sourceId};
}

export async function addProbe(db:Db, principal:KnowledgePrincipal, input:{versionId:string;subjectId:string;query:string;expectSourceId:string;gapId?:string;topK?:number;clientChangeId:string}) {
  const query = parse(text(300),input.query);
  requirePublicText([query]);
  if (input.topK !== undefined && (!Number.isInteger(input.topK) || input.topK<1 || input.topK>20))
    throw new ApiError(422,'topK phải từ 1 đến 20.');
  const checked=await replay(db,principal,input.clientChangeId,input);
  if (checked.target) return {id:checked.target};
  const v=await ownedStage(db,principal,input.versionId);
  const id=crypto.randomUUID(), change=crypto.randomUUID();
  await db.batch([
    db.prepare(`${lineage} INSERT OR IGNORE INTO knowledge_changes
      SELECT ?,?,'add_probe',?,'',?,?,?,? WHERE EXISTS(SELECT 1 FROM knowledge_versions WHERE seq=? AND status='staged')
      AND (SELECT count(*) FROM knowledge_probes WHERE added_seq=?)<30
      AND EXISTS(SELECT 1 FROM knowledge_sources s WHERE s.id=? AND ${visibleSource})
      AND EXISTS(SELECT 1 FROM subjects WHERE id=?)
      AND (? IS NULL OR EXISTS(SELECT 1 FROM knowledge_gaps WHERE id=? AND subject_id=?))`)
      .bind(v.seq,change,v.seq,id,principal.clientId,input.clientChangeId,checked.hash,new Date().toISOString(),v.seq,v.seq,input.expectSourceId,input.subjectId,input.gapId??null,input.gapId??null,input.subjectId),
    db.prepare("INSERT INTO knowledge_probes SELECT ?,?,?,?,?,?,?,?,NULL WHERE EXISTS(SELECT 1 FROM knowledge_changes WHERE id=?)")
      .bind(id,input.subjectId,query,input.expectSourceId,input.gapId??null,input.topK??5,principal.clientId,v.seq,change),
  ]);
  const saved=await replay(db,principal,input.clientChangeId,input);
  if (!saved.target) throw conflict('Bản nháp, nguồn hoặc sổ không hợp lệ, hoặc đã đủ probe.');
  return {id:saved.target};
}

export async function activate(db:Db, principal:KnowledgePrincipal, id:string) {
  const v=await ownedStage(db,principal,id);
  const snapshot=await db.prepare("SELECT count(*) AS n FROM knowledge_changes WHERE version_seq=?").bind(v.seq).first<{n:number}>();
  const {results:probes=[]}=await db.prepare(`${lineage} SELECT * FROM knowledge_probes WHERE added_seq IN (SELECT seq FROM lineage)`)
    .bind(v.seq).all<{id:string;subject_id:string;query:string;expect_source_id:string;top_k:number}>();
  const {results:replacements=[]}=await db.prepare(`${lineage} SELECT c.target_id AS sourceId,
    json_extract(c.reason,'$.supersededBy') AS replacement FROM knowledge_changes c
    WHERE c.action='deprecate' AND c.version_seq IN (SELECT seq FROM lineage) ORDER BY c.version_seq`)
    .bind(v.seq).all<{sourceId:string;replacement:string}>();
  const successors=new Map(replacements.map(row=>[row.sourceId,row.replacement]));
  const failed: string[]=[];
  for (const probe of probes) {
    const matches=await scoreNotes(db,probe.query,probe.subject_id,v.seq,probe.top_k);
    let expected=probe.expect_source_id;
    const seen=new Set<string>();
    while (successors.has(expected) && !seen.has(expected)) {
      seen.add(expected);
      expected=successors.get(expected)!;
    }
    if (!matches.some(row=>row.sourceId===expected)) failed.push(probe.id);
  }
  const ok=probes.length>0&&!failed.length;
  const report={checked:probes.length,failed};
  const now=new Date().toISOString();
  const stamp=crypto.randomUUID();
  const activation=db.prepare(`INSERT INTO knowledge_changes
    SELECT ?,?,'activate',?,?,? ,?,?,? WHERE EXISTS(SELECT 1 FROM knowledge_versions WHERE seq=? AND status='staged')
    AND (SELECT seq FROM knowledge_versions WHERE status='active') IS ?
    AND (SELECT count(*) FROM knowledge_changes WHERE version_seq=?)=?`)
    .bind(stamp,v.seq,id,JSON.stringify(report),principal.clientId,stamp,'',now,v.seq,v.parent_seq,v.seq,snapshot?.n??0);
  await db.batch([activation,db.prepare(`UPDATE knowledge_versions SET status=?,check_report=?,activated_at=?
    WHERE seq=? AND EXISTS(SELECT 1 FROM knowledge_changes WHERE id=?)`)
    .bind(ok?'active':'failed',JSON.stringify(report),ok?now:null,v.seq,stamp)]);
  const updated=await version(db,id);
  if (updated?.status==='staged') throw conflict('Bản đang dùng hoặc bản nháp vừa đổi. Kiểm tra lại.');
  return {seq:v.seq,status:updated?.status,report};
}

export async function rollback(db:Db, principal:KnowledgePrincipal, toSeq:number, reason:unknown) {
  const message=parse(text(300),reason);
  requirePublicText([message]);
  const before=await active(db);
  const stamp=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO knowledge_changes
      SELECT ?,?,'rollback',?,?,?,?,?,? WHERE (SELECT seq FROM knowledge_versions WHERE status='active')=?
      AND EXISTS(SELECT 1 FROM knowledge_versions WHERE seq=? AND status IN ('superseded','rolled_back'))`)
      .bind(stamp,toSeq,String(toSeq),message,principal.clientId,stamp,'',new Date().toISOString(),before?.seq??null,toSeq),
    db.prepare("UPDATE knowledge_versions SET status='active' WHERE seq=? AND EXISTS(SELECT 1 FROM knowledge_changes WHERE id=?)").bind(toSeq,stamp),
    db.prepare(`${lineage} UPDATE knowledge_gaps SET status='open',resolved_seq=NULL,resolution_note=NULL,resolved_at=NULL
      WHERE status='resolved' AND resolved_seq NOT IN (SELECT seq FROM lineage)
      AND EXISTS(SELECT 1 FROM knowledge_changes WHERE id=?)`).bind(toSeq,stamp),
  ]);
  if (!(await db.prepare("SELECT id FROM knowledge_changes WHERE id=?").bind(stamp).first()))
    throw conflict('Bản khôi phục chưa từng kích hoạt hoặc bản đang dùng vừa đổi.');
  return {seq:toSeq};
}

export async function history(db: Db, limit = 50) {
  const size = Math.max(1, Math.min(100, Math.trunc(limit)));
  const [versions, changes] = await Promise.all([
    db.prepare('SELECT seq,id,status,parent_seq,reason,check_report,created_at,activated_at FROM knowledge_versions ORDER BY seq DESC LIMIT ?').bind(size).all(),
    db.prepare(`SELECT c.version_seq,c.action,c.target_id,c.reason,c.client_change_id,c.created_at,s.url,s.version_label
      FROM knowledge_changes c LEFT JOIN knowledge_sources s ON s.id=c.target_id ORDER BY c.created_at DESC,c.rowid DESC LIMIT ?`).bind(size).all(),
  ]);
  return {versions:versions.results??[],changes:changes.results??[]};
}

export async function inventory(db:Db) {
  const current=await active(db);
  const [subjects,sources,gaps]=await Promise.all([
    db.prepare(`SELECT id,title,sensitivity,level,substr(goal,1,300) AS goal,substr(curriculum,1,150) AS curriculum,
      coalesce(knowledge_freshness_days,CASE
        WHEN lower(title) LIKE '%cardio%' THEN 180 WHEN sensitivity='clinical' THEN 90
        WHEN lower(title) LIKE '%deutsch%' OR legacy_track='Deutsch' THEN 365 ELSE 30 END) AS freshnessDays
      FROM subjects WHERE status<>'archived' ORDER BY title`).bind().all<{id:string;goal:string;curriculum:string;title:string;level:string}>(),
    current?db.prepare(`${lineage}
      SELECT s.id,s.url,s.title,s.publisher,s.source_type,s.version_label,s.retrieved_at,s.read_scope,s.published_at,
       (SELECT count(*) FROM knowledge_notes n WHERE n.source_id=s.id) AS noteCount,
       (SELECT json_group_array(DISTINCT l.subject_id) FROM knowledge_links l JOIN knowledge_notes n ON n.id=l.note_id WHERE n.source_id=s.id) AS subjectIds
      FROM knowledge_sources s WHERE ${visibleSource} ORDER BY s.retrieved_at DESC LIMIT 200`).bind(current.seq).all():null,
    db.prepare("SELECT count(*) AS n FROM knowledge_gaps WHERE status IN ('open','in_progress')").bind().first<{n:number}>(),
  ]);
  return {activeSeq:current?.seq??null,subjects:(subjects.results??[]).map(row=>({
    ...row, goal:publicSummary(row.goal),curriculum:publicSummary(row.curriculum),
    title:publicSummary(row.title),level:publicSummary(row.level),
  })),sources:sources?.results??[],openGaps:gaps?.n??0};
}

function publicSummary(value:string) {
  try { requirePublicText([value]); return value; } catch { return ''; }
}

export async function listGaps(db:Db,status='open',limit=10) {
  if (!['open','in_progress','resolved','wont_fix'].includes(status)) throw new ApiError(422,'Trạng thái câu hỏi không hợp lệ.');
  return (await db.prepare(`SELECT id,subject_id,question,why_missing,origin,priority,status,seen_count,resolved_seq,resolution_note,created_at,resolved_at
    FROM knowledge_gaps WHERE status=? ORDER BY priority='high' DESC,created_at,id LIMIT ?`)
    .bind(status,Math.max(1,Math.min(30,Math.trunc(limit)))).all()).results??[];
}

export async function search(db:Db, principal:KnowledgePrincipal, input:{query:string;subjectId:string;versionId?:string;k?:number}) {
  const query=parse(text(300),input.query);
  requirePublicText([query]);
  const selected=input.versionId?await version(db,input.versionId):await active(db);
  if (input.versionId && (!selected || selected.created_by!==principal.clientId || selected.status!=='staged' ||
      Date.parse(selected.created_at)<=Date.now()-6*3600000)) throw conflict('Bản nháp không còn mở.');
  return selected?scoreNotes(db,query,input.subjectId,selected.seq,input.k??5):[];
}

export async function deprecateSource(db:Db,principal:KnowledgePrincipal,input:{versionId:string;sourceId:string;supersededBy:string;reason:string;clientChangeId:string}) {
  const reason=parse(text(300),input.reason);
  requirePublicText([reason]);
  if(input.sourceId===input.supersededBy)throw new ApiError(422,'Chọn một nguồn thay thế khác.');
  const checked=await replay(db,principal,input.clientChangeId,input);
  if(checked.target)return {sourceId:checked.target,replayed:true};
  const v=await ownedStage(db,principal,input.versionId);
  const change=crypto.randomUUID(), stamp=new Date().toISOString();
  await db.batch([db.prepare(`${lineage} INSERT OR IGNORE INTO knowledge_changes
    SELECT ?,?,'deprecate',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM knowledge_versions WHERE seq=? AND status='staged')
    AND (SELECT count(*) FROM knowledge_sources s WHERE s.id IN (?,?) AND ${visibleSource})=2
    AND NOT EXISTS(SELECT 1 FROM knowledge_links old_link JOIN knowledge_notes old_note ON old_note.id=old_link.note_id
      WHERE old_note.source_id=? AND NOT EXISTS(
        SELECT 1 FROM knowledge_links new_link JOIN knowledge_notes new_note ON new_note.id=new_link.note_id
        WHERE new_note.source_id=? AND new_link.subject_id=old_link.subject_id))`)
    .bind(v.seq,change,v.seq,input.sourceId,JSON.stringify({reason,supersededBy:input.supersededBy}),
      principal.clientId,input.clientChangeId,checked.hash,stamp,v.seq,input.sourceId,input.supersededBy,input.sourceId,input.supersededBy)]);
  const saved=await replay(db,principal,input.clientChangeId,input);
  if(!saved.target)throw conflict('Nguồn thay thế phải dùng được trong các sổ có nguồn cũ.');
  return {sourceId:saved.target,replayed:false};
}

type GapInput = {subjectId:string;question:string;why:string;origin:'plan'|'assess'|'request'|'admin';jobId?:string;priority:'normal'|'high'};

async function prepareGap(db:Db,input:GapInput,applyToken?:string) {
  const question=parse(text(300),input.question),why=parse(text(300),input.why);
  requirePublicText([question,why]);
  const normalized=terms(question,100).join(' ');
  if(!normalized)throw new ApiError(422,'Câu hỏi kiến thức còn thiếu nội dung.');
  const key=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.subjectId+'\n'+normalized));
  const hash=Array.from(new Uint8Array(key),x=>x.toString(16).padStart(2,'0')).join('');
  const statement=db.prepare(`INSERT INTO knowledge_gaps
    (id,subject_id,question,why_missing,origin,job_id,priority,status,dedupe_hash,created_at)
    SELECT ?,?,?,?,?,?,?,'open',?,? WHERE (? IS NULL OR EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?))
    ON CONFLICT(dedupe_hash) DO UPDATE SET
    seen_count=knowledge_gaps.seen_count+1,priority=CASE WHEN excluded.priority='high' THEN 'high' ELSE knowledge_gaps.priority END`)
    .bind(crypto.randomUUID(),input.subjectId,question,why,input.origin,input.jobId??null,input.priority,hash,new Date().toISOString(),applyToken??null,input.jobId??null,applyToken??null);
  return {statement,hash};
}

export async function recordGap(db:Db,input:GapInput) {
  const {statement,hash}=await prepareGap(db,input);
  await db.batch([statement]);
  return db.prepare('SELECT id,status,seen_count FROM knowledge_gaps WHERE dedupe_hash=?').bind(hash).first();
}

export async function jobGapStatements(db:Db, job:{id:string;subject_id:string|null;kind:string;purpose:string}, gaps:Omit<GapInput,'subjectId'|'origin'|'jobId'>[], token:string) {
  if (!job.subject_id) return [];
  const statements = [];
  const seen = new Set<string>();
  for (const gap of gaps) {
    try {
      const {statement,hash} = await prepareGap(db,{...gap,subjectId:job.subject_id,jobId:job.id,
        origin:job.kind==='assess'?'assess':job.purpose==='request'?'request':'plan'},token);
      if (!seen.has(hash)) statements.push(statement);
      seen.add(hash);
    } catch(error) {
      if (!(error instanceof ApiError) || error.status!==422) throw error;
    }
  }
  return statements;
}

export async function resolveGap(db:Db,principal:KnowledgePrincipal,input:{gapId:string;status:'resolved'|'wont_fix';versionSeq?:number;note:string;clientChangeId:string}) {
  const note=parse(text(300),input.note);
  requirePublicText([note]);
  const checked=await replay(db,principal,input.clientChangeId,input);
  if(checked.target)return {id:checked.target,replayed:true};
  const current=await active(db);
  if(!current || (input.status==='resolved' && current.seq!==input.versionSeq))
    throw conflict('Chọn phiên bản đang dùng để đóng câu hỏi.');
  if(input.status==='resolved'&&!(await db.prepare(`${lineage}
    SELECT id FROM knowledge_probes WHERE gap_id=? AND added_seq IN (SELECT seq FROM lineage) LIMIT 1`)
    .bind(current.seq,input.gapId).first()))throw new ApiError(422,'Cần câu kiểm tra đạt cho câu hỏi này.');
  const id=crypto.randomUUID(),stamp=new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO knowledge_changes
      SELECT ?,?,'resolve_gap',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM knowledge_versions WHERE seq=? AND status='active')
      AND EXISTS(SELECT 1 FROM knowledge_gaps WHERE id=? AND status IN ('open','in_progress'))`)
      .bind(id,current.seq,input.gapId,note,principal.clientId,input.clientChangeId,checked.hash,stamp,current.seq,input.gapId),
    db.prepare(`UPDATE knowledge_gaps SET status=?,resolved_seq=?,resolution_note=?,resolved_at=?
      WHERE id=? AND EXISTS(SELECT 1 FROM knowledge_changes WHERE id=?)`)
      .bind(input.status,input.status==='resolved'?current.seq:null,note,stamp,input.gapId,id),
  ]);
  const saved=await replay(db,principal,input.clientChangeId,input);
  if(!saved.target)throw conflict('Câu hỏi hoặc bản đang dùng vừa đổi.');
  return {id:saved.target,replayed:false};
}
