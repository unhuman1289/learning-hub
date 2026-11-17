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
