ALTER TABLE learner_settings ADD COLUMN tutor_enabled INTEGER NOT NULL DEFAULT 1 CHECK(tutor_enabled IN (0,1));

CREATE TABLE tutor_turns (
  id TEXT PRIMARY KEY NOT NULL,
  lesson_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  question TEXT NOT NULL CHECK(length(question) BETWEEN 1 AND 500),
  answer TEXT CHECK(length(answer) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK(status IN ('queued','streaming','answered','failed','blocked')),
  leak_blocked INTEGER NOT NULL DEFAULT 0 CHECK(leak_blocked IN (0,1)),
  first_token_ms INTEGER CHECK(first_token_ms >= 0),
  created_at TEXT NOT NULL,
  answered_at TEXT,
  FOREIGN KEY (lesson_id, item_id) REFERENCES lesson_items(lesson_id, item_id) ON DELETE CASCADE
);

CREATE INDEX tutor_turns_lesson ON tutor_turns(lesson_id, learner_id, created_at);
CREATE UNIQUE INDEX tutor_turns_open ON tutor_turns(learner_id) WHERE status IN ('queued','streaming');
