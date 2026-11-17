-- Separate OpenAI authorization from the learner's daily lesson schedule.
CREATE TABLE ai_subject_controls (
  subject_id TEXT PRIMARY KEY NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  openai_enabled INTEGER NOT NULL DEFAULT 0 CHECK(openai_enabled IN (0, 1)),
  tts_enabled INTEGER NOT NULL DEFAULT 0 CHECK(tts_enabled IN (0, 1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE ai_control_log (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK(field IN ('openai_enabled', 'tts_enabled')),
  old_value INTEGER NOT NULL CHECK(old_value IN (0, 1)),
  new_value INTEGER NOT NULL CHECK(new_value IN (0, 1)),
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
CREATE INDEX ai_control_log_subject ON ai_control_log(subject_id, changed_at);
-- A marker is needed even when both legacy lists are empty.
CREATE TABLE ai_control_initialization (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  initialized_at TEXT NOT NULL
);
CREATE TABLE ai_speech_calls (
  hash TEXT PRIMARY KEY NOT NULL,
  openai_calls INTEGER NOT NULL DEFAULT 0 CHECK(openai_calls BETWEEN 0 AND 2)
);
ALTER TABLE ai_jobs ADD COLUMN openai_calls INTEGER NOT NULL DEFAULT 0 CHECK(openai_calls BETWEEN 0 AND 2);
ALTER TABLE tutor_turns ADD COLUMN openai_calls INTEGER NOT NULL DEFAULT 0 CHECK(openai_calls BETWEEN 0 AND 2);
