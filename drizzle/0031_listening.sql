CREATE TABLE audio_assets (
  hash TEXT PRIMARY KEY NOT NULL,
  lang TEXT NOT NULL,
  rate REAL NOT NULL,
  voices TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_job_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE lesson_items ADD COLUMN stimulus TEXT NOT NULL DEFAULT 'text' CHECK(stimulus IN ('text','audio'));
ALTER TABLE lesson_items ADD COLUMN audio_hash_f TEXT;
ALTER TABLE lesson_items ADD COLUMN audio_hash_m TEXT;
CREATE INDEX lesson_items_audio_f ON lesson_items(audio_hash_f, learner_id) WHERE audio_hash_f IS NOT NULL;
CREATE INDEX lesson_items_audio_m ON lesson_items(audio_hash_m, learner_id) WHERE audio_hash_m IS NOT NULL;

ALTER TABLE learning_lessons ADD COLUMN listen_log TEXT NOT NULL DEFAULT '{}';
ALTER TABLE attempts ADD COLUMN stimulus TEXT NOT NULL DEFAULT 'text' CHECK(stimulus IN ('text','audio'));
ALTER TABLE skill_states ADD COLUMN listening TEXT;
ALTER TABLE roadmap_steps ADD COLUMN listening INTEGER NOT NULL DEFAULT 0;
