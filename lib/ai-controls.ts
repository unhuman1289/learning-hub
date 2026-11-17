import type { EvidenceDb } from './evidence/submit.ts';

export type AiControlBindings = {
  OPENAI_ENABLED?: string;
  OPENAI_SUBJECT_IDS?: string;
  OPENAI_TTS_SUBJECT_IDS?: string;
};

/** D1 batch is transactional. The marker is written even for empty legacy lists. */
export async function initializeAiControls(db: EvidenceDb, env: AiControlBindings) {
  if (await db.prepare('SELECT id FROM ai_control_initialization WHERE id=1').first()) return;
  const parse = (value?: string) => [...new Set((value ?? '').split(',').map(x => x.trim()).filter(x => /^sub_[0-9a-f]{20}$/.test(x)))];
  const ai = JSON.stringify(parse(env.OPENAI_SUBJECT_IDS)), tts = JSON.stringify(parse(env.OPENAI_TTS_SUBJECT_IDS));
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO ai_subject_controls(subject_id,openai_enabled,tts_enabled,updated_by,updated_at)
      SELECT id, id IN (SELECT value FROM json_each(?)), id IN (SELECT value FROM json_each(?)), 'migration-from-secret', ?
      FROM subjects WHERE (id IN (SELECT value FROM json_each(?)) OR id IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM ai_control_initialization WHERE id=1)
      AND NOT EXISTS(SELECT 1 FROM ai_subject_controls)`).bind(ai,tts,now,ai,tts),
    db.prepare(`INSERT INTO ai_control_log(id,subject_id,field,old_value,new_value,changed_by,changed_at)
      SELECT lower(hex(randomblob(16))),subject_id,'openai_enabled',0,1,'migration-from-secret',? FROM ai_subject_controls
      WHERE updated_by='migration-from-secret' AND openai_enabled=1 AND NOT EXISTS(SELECT 1 FROM ai_control_initialization WHERE id=1)`).bind(now),
    db.prepare(`INSERT INTO ai_control_log(id,subject_id,field,old_value,new_value,changed_by,changed_at)
      SELECT lower(hex(randomblob(16))),subject_id,'tts_enabled',0,1,'migration-from-secret',? FROM ai_subject_controls
      WHERE updated_by='migration-from-secret' AND tts_enabled=1 AND NOT EXISTS(SELECT 1 FROM ai_control_initialization WHERE id=1)`).bind(now),
    db.prepare('INSERT OR IGNORE INTO ai_control_initialization(id,initialized_at) VALUES(1,?)').bind(now),
  ]);
}

export async function aiSubjects(db: EvidenceDb, env: AiControlBindings, tts = false) {
  if (env.OPENAI_ENABLED !== 'true') return [];
  await initializeAiControls(db, env);
  const { results = [] } = await db.prepare(`SELECT subject_id FROM ai_subject_controls WHERE openai_enabled=1${tts ? ' AND tts_enabled=1' : ''}`).all<{subject_id:string}>();
  return results.map(row => row.subject_id);
}

export async function setAiControls(db: EvidenceDb, env: AiControlBindings, subjectId: string, values: {openaiEnabled: boolean; ttsEnabled: boolean}, actor: string) {
  await initializeAiControls(db, env);
  const now = new Date().toISOString();
  const log = (field: 'openai_enabled' | 'tts_enabled', value: boolean) => db.prepare(`INSERT INTO ai_control_log(id,subject_id,field,old_value,new_value,changed_by,changed_at)
    SELECT lower(hex(randomblob(16))), s.id, ?, coalesce(c.${field},0), ?, ?, ? FROM subjects s
    LEFT JOIN ai_subject_controls c ON c.subject_id=s.id WHERE s.id=? AND coalesce(c.${field},0)<>?`)
    .bind(field, Number(value), actor, now, subjectId, Number(value));
  await db.batch([
    log('openai_enabled', values.openaiEnabled), log('tts_enabled', values.ttsEnabled),
    db.prepare(`INSERT INTO ai_subject_controls(subject_id,openai_enabled,tts_enabled,updated_by,updated_at)
      SELECT id,?,?,?,? FROM subjects WHERE id=?
      ON CONFLICT(subject_id) DO UPDATE SET openai_enabled=excluded.openai_enabled,tts_enabled=excluded.tts_enabled,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(Number(values.openaiEnabled),Number(values.ttsEnabled),actor,now,subjectId),
  ]);
}
