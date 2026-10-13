CREATE TABLE ai_jobs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('plan','assess')), purpose TEXT NOT NULL CHECK(purpose IN ('daily','initial','request','submission','recheck')),
 trigger TEXT NOT NULL CHECK(trigger IN ('scheduled','on_demand','deferred')), learner_id TEXT NOT NULL, subject_id TEXT, ref_id TEXT,
 learning_day TEXT NOT NULL, priority INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','leased','succeeded','failed','expired','cancelled')),
 dedupe_key TEXT NOT NULL UNIQUE, lease_client_id TEXT, lease_token_sha256 TEXT, lease_expires_at TEXT, lease_count INTEGER NOT NULL DEFAULT 0,
 context_hash TEXT, context_snapshot TEXT, result_hash TEXT, outcome TEXT, usage TEXT, validation_failures INTEGER NOT NULL DEFAULT 0,error TEXT,
 runner TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, expires_at TEXT NOT NULL,
 apply_token TEXT, cost_usd REAL
);
CREATE INDEX ai_jobs_queue ON ai_jobs(status,priority,created_at);
CREATE INDEX ai_jobs_budget ON ai_jobs(learning_day,learner_id,kind,purpose);
CREATE TABLE alert_events (
 id TEXT PRIMARY KEY, learning_day TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL,
 email_state TEXT NOT NULL DEFAULT 'pending' CHECK(email_state IN ('pending','sending','sent','failed')), sent_at TEXT, UNIQUE(learning_day,code)
);
CREATE TABLE attempt_diagnoses (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), job_id TEXT NOT NULL REFERENCES ai_jobs(id),
 learner_id TEXT NOT NULL, errors TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(attempt_id,job_id)
);
CREATE TABLE ai_apply_guards (token TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
