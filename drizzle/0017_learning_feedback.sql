ALTER TABLE subjects ADD COLUMN roadmap TEXT NOT NULL DEFAULT '[]';
CREATE TABLE lesson_reflections (
 submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
 learner_id TEXT NOT NULL, lesson_id TEXT NOT NULL REFERENCES learning_lessons(id), subject_id TEXT NOT NULL REFERENCES subjects(id),
 difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','fit','hard')),
 usefulness TEXT NOT NULL CHECK(usefulness IN ('useful','mixed','not_useful')),
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 720),
 note TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX lesson_reflections_context ON lesson_reflections(learner_id,subject_id,updated_at);
