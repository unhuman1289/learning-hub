CREATE TABLE grader_calibrations (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  set_hash TEXT NOT NULL,
  n INTEGER NOT NULL CHECK (n > 0),
  agreement REAL NOT NULL CHECK (agreement >= 0 AND agreement <= 1),
  evidence_not_verbatim INTEGER NOT NULL CHECK (evidence_not_verbatim >= 0),
  injection_shifted INTEGER NOT NULL CHECK (injection_shifted >= 0),
  mean_ms REAL NOT NULL CHECK (mean_ms >= 0),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX grader_calibrations_created_at ON grader_calibrations(created_at DESC);

-- Calibration is system-wide and has no learner/subject; keep it out of learner jobs.
CREATE TABLE calibration_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'calibrate' CHECK(kind = 'calibrate'),
  status TEXT NOT NULL CHECK(status IN ('queued','leased','succeeded','failed')),
  calls INTEGER NOT NULL DEFAULT 0 CHECK(calls BETWEEN 0 AND 8),
  schedule_key TEXT UNIQUE,
  lease_token TEXT,
  lease_expires_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX calibration_one_active ON calibration_jobs(kind) WHERE status IN ('queued','leased');
