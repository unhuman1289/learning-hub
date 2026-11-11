ALTER TABLE learner_requests ADD COLUMN metadata TEXT;
ALTER TABLE ai_jobs ADD COLUMN adaptive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_lessons ADD COLUMN roadmap_step_id TEXT;
CREATE UNIQUE INDEX adaptive_roadmap_introduction ON learning_lessons(user_id,subject_id,roadmap_step_id) WHERE roadmap_step_id IS NOT NULL;
