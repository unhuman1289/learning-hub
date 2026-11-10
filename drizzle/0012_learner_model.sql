CREATE TABLE skill_states (
 skill_id TEXT PRIMARY KEY REFERENCES skills(id), learner_id TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES subjects(id),
 mastery TEXT NOT NULL CHECK(mastery IN ('not_assessed','introduced','developing','demonstrated','needs_review')),
 mastery_ceiling TEXT NOT NULL, mastery_source TEXT NOT NULL DEFAULT 'rules', mastery_reason TEXT NOT NULL DEFAULT '',
 dim_knowledge INTEGER NOT NULL CHECK(dim_knowledge BETWEEN 0 AND 3), dim_recognition INTEGER NOT NULL CHECK(dim_recognition BETWEEN 0 AND 3),
 dim_application INTEGER NOT NULL CHECK(dim_application BETWEEN 0 AND 3), dim_retention INTEGER NOT NULL CHECK(dim_retention BETWEEN 0 AND 3),
 exposure TEXT NOT NULL DEFAULT '{}', recent_exposure TEXT NOT NULL DEFAULT '{}', stuck_on TEXT,
 attempts_total INTEGER NOT NULL, last_attempt_at TEXT, last_independent_at TEXT,
 review_interval_days INTEGER, next_review_day TEXT, review_kind TEXT, review_step_day TEXT, maintained INTEGER NOT NULL DEFAULT 0,
 evidence_hash TEXT NOT NULL, recompute_token TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX skill_states_due ON skill_states(learner_id,next_review_day);
CREATE TABLE error_patterns (
 id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES subjects(id), skill_id TEXT NOT NULL REFERENCES skills(id),
 label TEXT NOT NULL, label_norm TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('knowledge','application','slip','reading','unknown')),
 confidence TEXT NOT NULL CHECK(confidence IN ('suspected','confirmed')), status TEXT NOT NULL CHECK(status IN ('open','improving','resolved')),
 occurrences INTEGER NOT NULL, days_seen INTEGER NOT NULL, example_attempt_ids TEXT NOT NULL DEFAULT '[]', intervention TEXT NOT NULL DEFAULT '',
 first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, resolved_at TEXT,
 UNIQUE(skill_id,label_norm)
);
