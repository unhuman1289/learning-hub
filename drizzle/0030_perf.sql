CREATE TABLE perf_daily (
  day TEXT NOT NULL,
  screen TEXT NOT NULL,
  country TEXT NOT NULL,
  device TEXT NOT NULL,
  n INTEGER NOT NULL,
  p50 INTEGER NOT NULL,
  p75 INTEGER NOT NULL,
  p95 INTEGER NOT NULL,
  PRIMARY KEY (day, screen, country, device)
) WITHOUT ROWID;

-- Counts by integer millisecond allow exact daily percentiles across beacon batches.
CREATE TABLE perf_counts (
  day TEXT NOT NULL,
  screen TEXT NOT NULL,
  country TEXT NOT NULL,
  device TEXT NOT NULL,
  ms INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, screen, country, device, ms)
) WITHOUT ROWID;
