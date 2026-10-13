-- AI review proposals survive the nightly refresh while the evidence is unchanged (DATA-MODEL §3.4).
ALTER TABLE skill_states ADD COLUMN review_source TEXT NOT NULL DEFAULT 'rules' CHECK(review_source IN ('rules','ai'));
--> statement-breakpoint
-- Joins used on every submission, assessment and recompute.
CREATE INDEX attempts_submission ON attempts(submission_id);
--> statement-breakpoint
CREATE INDEX grades_attempt ON grades(attempt_id);
--> statement-breakpoint
CREATE INDEX grades_job ON grades(job_id);
