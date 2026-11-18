import type { EvidenceDb } from './evidence/submit.ts';

export type AiControlBindings = {
  OPENAI_ENABLED?: string;
  OPENAI_SUBJECT_IDS?: string;
  OPENAI_TTS_SUBJECT_IDS?: string;
};

/** Since 17/11/2026 every notebook uses OpenAI and TTS unless an admin turns it off (owner decision, children included).
 * The legacy secret allowlists are no longer copied; only the one-time marker is kept. */
export async function initializeAiControls(db: EvidenceDb, _env: AiControlBindings) {
  await db.prepare('INSERT OR IGNORE INTO ai_control_initialization(id,initialized_at) VALUES(1,?)').bind(new Date().toISOString()).run();
}

export async function aiSubjects(db: EvidenceDb, env: AiControlBindings, tts = false) {
  if (env.OPENAI_ENABLED !== 'true') return [];
  await initializeAiControls(db, env);
  const { results = [] } = await db.prepare(`SELECT s.id AS subject_id FROM subjects s LEFT JOIN ai_subject_controls c ON c.subject_id=s.id
    WHERE coalesce(c.openai_enabled,1)=1${tts ? ' AND coalesce(c.tts_enabled,1)=1' : ''}`).all<{subject_id:string}>();
  return results.map(row => row.subject_id);
}

export async function aiSubjectEnabled(db: EvidenceDb, env: AiControlBindings, subjectId: string) {
  if (env.OPENAI_ENABLED !== 'true') return false;
  const row = await db.prepare(`SELECT 1 AS enabled FROM subjects s LEFT JOIN ai_subject_controls c ON c.subject_id=s.id
    WHERE s.id=? AND coalesce(c.openai_enabled,1)=1`).bind(subjectId).first<{enabled:number}>();
  return !!row;
}

export async function setAiControls(db: EvidenceDb, env: AiControlBindings, subjectId: string, values: {openaiEnabled: boolean; ttsEnabled: boolean}, actor: string) {
  await initializeAiControls(db, env);
  const now = new Date().toISOString();
  const log = (field: 'openai_enabled' | 'tts_enabled', value: boolean) => db.prepare(`INSERT INTO ai_control_log(id,subject_id,field,old_value,new_value,changed_by,changed_at)
    SELECT lower(hex(randomblob(16))), s.id, ?, coalesce(c.${field},1), ?, ?, ? FROM subjects s
    LEFT JOIN ai_subject_controls c ON c.subject_id=s.id WHERE s.id=? AND coalesce(c.${field},1)<>?`)
    .bind(field, Number(value), actor, now, subjectId, Number(value));
  await db.batch([
    log('openai_enabled', values.openaiEnabled), log('tts_enabled', values.ttsEnabled),
    db.prepare(`INSERT INTO ai_subject_controls(subject_id,openai_enabled,tts_enabled,updated_by,updated_at)
      SELECT id,?,?,?,? FROM subjects WHERE id=?
      ON CONFLICT(subject_id) DO UPDATE SET openai_enabled=excluded.openai_enabled,tts_enabled=excluded.tts_enabled,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(Number(values.openaiEnabled),Number(values.ttsEnabled),actor,now,subjectId),
  ]);
}
