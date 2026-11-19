-- Support lesson-level submission timestamps and lookup of the latest reflection.
-- Existing submissions, grades, attempts, and reflection rows are preserved.
CREATE INDEX submissions_lesson_history ON submissions(lesson_id, learner_id, created_at);
CREATE INDEX lesson_reflections_lesson ON lesson_reflections(lesson_id, learner_id, updated_at DESC, created_at DESC, submission_id DESC);
