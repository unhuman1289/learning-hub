import type { JournalDb } from '../run-journal.ts';
import { cutoffFor } from '../daily-policy.ts';
import { buildAutomationContext } from './context.ts';
import type { AutomationResultInput, StartRunInput } from './schema.ts';
import { decideReplacement } from './replacement.ts';
import { issueStatement, noActionStatement, replacementStatements } from './sql.ts';
import { containsContactDetails, containsExplicitIdentifier, containsPossibleClinicalIdentifier, redactContactDetails } from './privacy.ts';

type RunRow = { id: string; client_id: string; status: 'created' | 'context_served' | 'finished' | 'failed' | 'expired'; created_at: string; expires_at: string; context_hash: string | null; context_json: string | null; result_hash: string | null; result_json: string | null; error: string | null; request_hash: string };
type TargetRow = { target_id: string; user_id: string; track: string; current_lesson_id: string | null; eligible: number; eligibility: string; context_json: string };

export class AutomationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const eventId = (runId: string, event: string) => `evt_${runId}_${event}`;

async function rowFor(db: JournalDb, runId: string, clientId?: string): Promise<RunRow> {
  const row = await db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(runId).first<RunRow>();
  if (!row || (clientId && row.client_id !== clientId)) throw new AutomationError(404, 'run_not_found', 'Run not found.');
  return row;
}

async function expireIfDue(db: JournalDb, run: RunRow, now: Date) {
  if ((run.status === 'created' || run.status === 'context_served') && Date.parse(run.expires_at) <= now.getTime()) {
    await db.batch([
      db.prepare("UPDATE automation_runs SET status='expired',finished_at=?,error='Run expired.' WHERE id=? AND status IN ('created','context_served') AND expires_at<=?").bind(now.toISOString(), run.id, now.toISOString()),
      db.prepare("INSERT OR IGNORE INTO run_events(id,run_id,occurred_at,type,detail) SELECT ?,?,?,'expired','{}' WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND status='expired')").bind(eventId(run.id, 'expired'), run.id, now.toISOString(), run.id),
    ]);
    return true;
  }
  return false;
}

export async function createAutomationRun(db: JournalDb, clientId: string, input: StartRunInput, idempotencyKey: string | null, now = new Date()) {
  if ([input.runner.name, input.runner.version, input.runner.model].some((value) => containsContactDetails(value) || containsExplicitIdentifier(value))) {
    throw new AutomationError(400, 'invalid_payload', 'Runner metadata contains identifying information.');
  }
  if (idempotencyKey && !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) throw new AutomationError(400, 'invalid_payload', 'Invalid Idempotency-Key.');
  const requestHash = await hash(JSON.stringify(input));
  if (idempotencyKey) {
    const existing = await db.prepare('SELECT * FROM automation_runs WHERE client_id=? AND idempotency_key=?').bind(clientId, idempotencyKey).first<RunRow>();
    if (existing) {
      if (existing.request_hash !== requestHash) throw new AutomationError(409, 'idempotency_conflict', 'Idempotency-Key was already used with different input.');
      return { runId: existing.id, status: existing.status, expiresAt: existing.expires_at, replayed: true };
    }
  }

  const runId = crypto.randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO automation_runs(id,client_id,contract_version,trigger,runner_name,runner_version,runner_model,idempotency_key,request_hash,status,created_at,expires_at) VALUES(?,?,'1',?,?,?,?,?,?,'created',?,?)")
      .bind(runId, clientId, input.trigger, input.runner.name, input.runner.version, input.runner.model, idempotencyKey, requestHash, createdAt, expiresAt),
    db.prepare("INSERT OR IGNORE INTO run_events(id,run_id,occurred_at,type,detail) SELECT ?,?,?,'created',? WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND request_hash=?)")
      .bind(eventId(runId, 'created'), runId, createdAt, JSON.stringify({ clientId, trigger: input.trigger }), runId, requestHash),
  ]);
  const created = idempotencyKey
    ? await db.prepare('SELECT * FROM automation_runs WHERE client_id=? AND idempotency_key=?').bind(clientId, idempotencyKey).first<RunRow>()
    : await db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(runId).first<RunRow>();
  if (!created) throw new AutomationError(503, 'unavailable', 'Could not create a run.');
  const storedHash = await db.prepare('SELECT request_hash FROM automation_runs WHERE id=?').bind(created.id).first<{ request_hash: string }>();
  if (storedHash?.request_hash !== requestHash) throw new AutomationError(409, 'idempotency_conflict', 'Idempotency-Key was already used with different input.');
  return { runId: created.id, status: created.status, expiresAt: created.expires_at, replayed: created.id !== runId };
}

export async function serveAutomationContext(db: JournalDb, runId: string, clientId: string, now = new Date()) {
  let run = await rowFor(db, runId, clientId);
  if (await expireIfDue(db, run, now)) throw new AutomationError(410, 'run_expired', 'Run expired.');
  run = await rowFor(db, runId, clientId);
  if (run.status === 'expired') throw new AutomationError(410, 'run_expired', 'Run expired.');
  if (run.context_json) return JSON.parse(run.context_json);
  if (run.status !== 'created') throw new AutomationError(409, 'run_closed', 'Run is not available for context.');

  const built = await buildAutomationContext(db, runId, now);
  const publicTargets = new Map(built.context.targets.map((target) => [target.targetId, target]));
  const statements = built.targets.map((target) => db.prepare("INSERT OR IGNORE INTO run_targets(run_id,target_id,user_id,track,current_lesson_id,eligible,eligibility,context_json) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND status='created')")
    .bind(runId, target.targetId, target.userId, target.track, target.currentLessonId, target.eligible ? 1 : 0, target.eligibility, JSON.stringify(publicTargets.get(target.targetId)), runId));
  statements.push(db.prepare("UPDATE automation_runs SET status='context_served',context_hash=?,context_json=? WHERE id=? AND status='created'").bind(built.context.contextHash, JSON.stringify(built.context), runId));
  statements.push(db.prepare("INSERT OR IGNORE INTO run_events(id,run_id,occurred_at,type,detail) SELECT ?,?,?,'context_served',? WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND status='context_served')")
    .bind(eventId(runId, 'context_served'), runId, now.toISOString(), JSON.stringify({ contextHash: built.context.contextHash, targetCount: built.context.targets.length }), runId));
  await db.batch(statements);
  run = await rowFor(db, runId, clientId);
  if (!run.context_json) throw new AutomationError(409, 'run_closed', 'Another request changed this run. Read its saved state.');
  return JSON.parse(run.context_json);
}

export async function acceptAutomationResult(db: JournalDb, runId: string, clientId: string, input: AutomationResultInput, now = new Date()) {
  let run = await rowFor(db, runId, clientId);
  const resultHash = await hash(JSON.stringify(input));
  if (run.status === 'finished') {
    if (run.result_hash !== resultHash || !run.result_json) throw new AutomationError(409, 'result_conflict', 'A different result has already been accepted. Read the run before retrying.');
    return { ...JSON.parse(run.result_json), replayed: true };
  }
  if (await expireIfDue(db, run, now)) throw new AutomationError(410, 'run_expired', 'Run expired.');
  run = await rowFor(db, runId, clientId);
  if (run.status === 'expired') throw new AutomationError(410, 'run_expired', 'Run expired.');
  if (run.status !== 'context_served' || !run.context_json || !run.context_hash) throw new AutomationError(409, 'run_closed', 'Run context must be served before its result.');
  if (input.contextHash !== run.context_hash) throw new AutomationError(409, 'context_mismatch', 'The supplied contextHash does not match this run.');

  const targets = (await db.prepare('SELECT * FROM run_targets WHERE run_id=? ORDER BY target_id').bind(runId).all<TargetRow>()).results;
  const byId = new Map(targets.map((target) => [target.target_id, target]));
  const context = JSON.parse(run.context_json) as { targets: { targetId: string; currentLesson: { assignedDate: string; completedAt: string | null } | null; newAnswers: { lessonId: string }[] }[] };
  const contextTargets = new Map(context.targets.map((target) => [target.targetId, target]));
  for (const item of input.items) if (!byId.has(item.targetId)) throw new AutomationError(400, 'invalid_payload', 'A result referenced a target outside this run.');

  if (containsContactDetails(input.summary) || containsExplicitIdentifier(input.summary)) throw new AutomationError(400, 'invalid_payload', 'Result summary contains identifying information.');
  for (const item of input.items) {
    const target = byId.get(item.targetId)!;
    if ('reason' in item && item.reason && (containsContactDetails(item.reason) || containsExplicitIdentifier(item.reason))) {
      throw new AutomationError(400, 'invalid_payload', 'Result reason contains identifying information.');
    }
    if (item.action === 'assign') {
      const content = JSON.stringify(item.lesson);
      if (containsPossibleClinicalIdentifier(content, target.track as import('../daily-policy.ts').LearningTrack) || containsContactDetails(content)) {
        throw new AutomationError(400, 'invalid_payload', 'Lesson content may contain identifiable clinical or contact information.');
      }
    }
  }

  const day = (JSON.parse(run.context_json) as { learningDay: string }).learningDay;
  const cutoff = cutoffFor(day);
  const statements = [];
  for (const target of targets) {
    const item = input.items.find((candidate) => candidate.targetId === target.target_id);
    if (!item || item.action === 'no_action') {
      const query = noActionStatement(runId, target.target_id, item?.action === 'no_action' ? item.reason ?? 'Runner chose no action.' : 'Target omitted; no change requested.');
      statements.push(db.prepare(query.sql).bind(...query.args));
      continue;
    }
    if (item.action === 'issue') {
      const query = issueStatement(runId, target.target_id, item.reason, JSON.stringify(item));
      statements.push(db.prepare(query.sql).bind(...query.args));
      continue;
    }

    const lessonId = `les_${crypto.randomUUID().replaceAll('-', '')}`;
    const snapshot = contextTargets.get(target.target_id);
    const current = await db.prepare('SELECT l.id AS lessonId,l.assigned_date AS assignedDate,l.completed_at AS completedAt FROM learning_slots s JOIN learning_lessons l ON l.user_id=s.user_id AND l.id=s.lesson_id WHERE s.user_id=? AND s.track=?').bind(target.user_id, target.track).first<{ lessonId: string; assignedDate: string; completedAt: string | null }>();
    const decision = decideReplacement({
      targetId: target.target_id,
      userId: target.user_id,
      track: target.track as import('../daily-policy.ts').LearningTrack,
      eligible: target.eligible === 1,
      eligibility: target.eligibility,
      expectedCurrentLessonId: item.expectedCurrentLessonId,
      currentLessonId: target.current_lesson_id,
      assignedDate: snapshot?.currentLesson?.assignedDate ?? null,
      completedAt: snapshot?.currentLesson?.completedAt ?? null,
    }, { lessonId: current?.lessonId ?? null, assignedDate: current?.assignedDate ?? null, completedAt: current?.completedAt ?? null }, day);
    const queries = replacementStatements({
      runId, clientId, targetId: target.target_id, userId: target.user_id, track: target.track,
      expectedCurrentLessonId: item.expectedCurrentLessonId, lessonId,
      lessonJson: JSON.stringify(item.lesson), day, cutoff, now: now.toISOString(),
      canAssign: decision.assign, reason: decision.reason,
    });
    statements.push(...queries.map((query) => db.prepare(query.sql).bind(...query.args)));
  }

  for (const target of context.targets) for (const answer of target.newAnswers) {
    const savedTarget = byId.get(target.targetId);
    if (savedTarget) statements.push(db.prepare('UPDATE learning_lessons SET automation_reviewed_at=? WHERE user_id=? AND id=? AND completed_at IS NOT NULL AND automation_reviewed_at IS NULL').bind(now.toISOString(), savedTarget.user_id, answer.lessonId));
  }
  const jsonResult = `json_object('runId',?, 'status','finished', 'replayed',0, 'summary',?, 'items', json(COALESCE((SELECT json_group_array(json_object('targetId',target_id,'action',action,'outcome',outcome,'reason',reason,'lessonId',lesson_id)) FROM run_items WHERE run_id=? ORDER BY target_id),'[]')))`;
  statements.push(db.prepare(`UPDATE automation_runs SET status='finished',result_hash=?,result_json=${jsonResult},finished_at=?,error=NULL WHERE id=? AND client_id=? AND status='context_served' AND context_hash=? AND expires_at>?`)
    .bind(resultHash, runId, input.summary, runId, now.toISOString(), runId, clientId, input.contextHash, now.toISOString()));
  statements.push(db.prepare("INSERT OR IGNORE INTO run_events(id,run_id,occurred_at,type,detail) SELECT ?,?,?,'result_accepted',? WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND status='finished' AND result_hash=?)")
    .bind(eventId(runId, 'result_accepted'), runId, now.toISOString(), JSON.stringify({ resultHash }), runId, resultHash));
  await db.batch(statements);

  const saved = await rowFor(db, runId, clientId);
  if (saved.status !== 'finished' || !saved.result_json) throw new AutomationError(409, 'run_closed', 'Run changed while the result was being saved. Read the run state before retrying.');
  if (saved.result_hash !== resultHash) throw new AutomationError(409, 'result_conflict', 'A different result won the concurrent write. Read the run before retrying.');
  return JSON.parse(saved.result_json);
}

export async function failAutomationRun(db: JournalDb, runId: string, clientId: string, message: string, now = new Date()) {
  const run = await rowFor(db, runId, clientId);
  if (run.status === 'finished') throw new AutomationError(409, 'run_closed', 'A finished run cannot be marked failed.');
  if (await expireIfDue(db, run, now)) throw new AutomationError(410, 'run_expired', 'Run expired.');
  if (run.status === 'expired') throw new AutomationError(410, 'run_expired', 'Run expired.');
  const safeMessage = containsExplicitIdentifier(message) ? 'Failure details were withheld for privacy.' : redactContactDetails(message).slice(0, 1000);
  await db.batch([
    db.prepare("UPDATE automation_runs SET status='failed',finished_at=?,error=? WHERE id=? AND client_id=? AND status IN ('created','context_served')")
      .bind(now.toISOString(), safeMessage, runId, clientId),
    db.prepare("INSERT OR IGNORE INTO run_events(id,run_id,occurred_at,type,detail) SELECT ?,?,?,'failed',? WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND status='failed')")
      .bind(eventId(runId, 'failed'), runId, now.toISOString(), JSON.stringify({ error: safeMessage }), runId),
  ]);
  const saved = await rowFor(db, runId, clientId);
  if (saved.status !== 'failed') throw new AutomationError(409, 'run_closed', 'The run changed before its failure report was saved. Read its state.');
  return { runId, status: saved.status };
}

export async function readAutomationRun(db: JournalDb, runId: string, clientId: string, now = new Date()) {
  let run = await rowFor(db, runId, clientId);
  await expireIfDue(db, run, now);
  run = await rowFor(db, runId, clientId);
  const items = (await db.prepare('SELECT target_id AS targetId,action,outcome,reason,lesson_id AS lessonId FROM run_items WHERE run_id=? ORDER BY target_id').bind(runId).all()).results;
  return { runId, status: run.status, createdAt: run.created_at, expiresAt: run.expires_at, contextHash: run.context_hash, error: run.error, items };
}
