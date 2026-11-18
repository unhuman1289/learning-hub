-- A validated daily plan remains separate from learning state until its Berlin day.
CREATE TABLE prepared_daily_plans (
 job_id TEXT PRIMARY KEY REFERENCES ai_jobs(id),
 result TEXT NOT NULL,
 result_hash TEXT NOT NULL,
 created_at TEXT NOT NULL
);
