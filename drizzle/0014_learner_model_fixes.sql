-- AI review proposals survive the nightly refresh while the evidence is unchanged (DATA-MODEL §3.4).
ALTER TABLE skill_states ADD COLUMN review_source TEXT NOT NULL DEFAULT 'rules' CHECK(review_source IN ('rules','ai'));
--> statement-breakpoint
-- Joins used on every submission, assessment and recompute.
CREATE INDEX attempts_submission ON attempts(submission_id);
--> statement-breakpoint
CREATE INDEX grades_attempt ON grades(attempt_id);
--> statement-breakpoint
CREATE INDEX grades_job ON grades(job_id);
--> statement-breakpoint
-- System notebooks the server creates itself (DATA-MODEL §2.1): one "Khám phá" per learner for exploration lessons.
ALTER TABLE subjects ADD COLUMN system_kind TEXT CHECK(system_kind IN ('explore','connect'));
--> statement-breakpoint
CREATE UNIQUE INDEX subjects_system_kind ON subjects(learner_id, system_kind) WHERE system_kind IS NOT NULL;
--> statement-breakpoint
CREATE INDEX disputes_attempt ON disputes(attempt_id);
