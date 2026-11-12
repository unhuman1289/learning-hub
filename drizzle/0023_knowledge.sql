ALTER TABLE subjects ADD COLUMN knowledge_freshness_days INTEGER
  CHECK (knowledge_freshness_days BETWEEN 1 AND 3650);

CREATE TABLE knowledge_versions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('staged','active','superseded','failed','rolled_back')),
  parent_seq INTEGER REFERENCES knowledge_versions(seq),
  created_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  check_report TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT
);
CREATE UNIQUE INDEX knowledge_one_active ON knowledge_versions(status) WHERE status='active';
CREATE UNIQUE INDEX knowledge_one_stage ON knowledge_versions(created_by) WHERE status='staged';

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY, url TEXT NOT NULL CHECK (url LIKE 'https://%'), title TEXT NOT NULL,
  publisher TEXT NOT NULL, issuer TEXT, source_type TEXT NOT NULL
    CHECK (source_type IN ('guideline','official_doc','textbook','paper','review','preprint','web')),
  published_at TEXT, version_label TEXT, retrieved_at TEXT NOT NULL,
  read_scope TEXT NOT NULL CHECK (read_scope IN ('full','partial','abstract')),
  jurisdiction TEXT CHECK (jurisdiction IN ('DE','EU','intl','other')),
  applies_in_germany TEXT CHECK (applies_in_germany IN ('yes','no','unknown')),
  language TEXT NOT NULL, evidence_note TEXT,
  added_seq INTEGER NOT NULL REFERENCES knowledge_versions(seq),
  removed_seq INTEGER REFERENCES knowledge_versions(seq),
  superseded_by TEXT REFERENCES knowledge_sources(id), created_by TEXT NOT NULL
);
CREATE INDEX knowledge_sources_by_version ON knowledge_sources(added_seq);

CREATE TABLE knowledge_notes (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
  heading TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body)<=1500), quote TEXT,
  added_seq INTEGER NOT NULL REFERENCES knowledge_versions(seq), removed_seq INTEGER REFERENCES knowledge_versions(seq)
);
CREATE INDEX knowledge_notes_by_source ON knowledge_notes(source_id);

CREATE TABLE knowledge_links (
  note_id TEXT NOT NULL REFERENCES knowledge_notes(id), subject_id TEXT REFERENCES subjects(id),
  skill_key TEXT, added_seq INTEGER NOT NULL REFERENCES knowledge_versions(seq),
  removed_seq INTEGER REFERENCES knowledge_versions(seq)
);
CREATE INDEX knowledge_links_by_note ON knowledge_links(note_id);

CREATE TABLE knowledge_terms (
  note_id TEXT NOT NULL REFERENCES knowledge_notes(id), term TEXT NOT NULL, weight INTEGER NOT NULL,
  PRIMARY KEY(term,note_id)
);

CREATE TABLE knowledge_gaps (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id),
  question TEXT NOT NULL CHECK(length(question)<=300), why_missing TEXT NOT NULL CHECK(length(why_missing)<=300),
  origin TEXT NOT NULL CHECK(origin IN ('plan','assess','request','admin')), job_id TEXT,
  priority TEXT NOT NULL CHECK(priority IN ('normal','high')),
  status TEXT NOT NULL CHECK(status IN ('open','in_progress','resolved','wont_fix')),
  dedupe_hash TEXT NOT NULL UNIQUE, seen_count INTEGER NOT NULL DEFAULT 1,
  resolved_seq INTEGER REFERENCES knowledge_versions(seq), resolution_note TEXT, created_at TEXT NOT NULL, resolved_at TEXT
);

CREATE TABLE knowledge_probes (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id), query TEXT NOT NULL,
  expect_source_id TEXT NOT NULL REFERENCES knowledge_sources(id), gap_id TEXT REFERENCES knowledge_gaps(id), top_k INTEGER NOT NULL DEFAULT 5,
  created_by TEXT NOT NULL, added_seq INTEGER NOT NULL REFERENCES knowledge_versions(seq),
  removed_seq INTEGER REFERENCES knowledge_versions(seq)
);

CREATE TABLE knowledge_changes (
  id TEXT PRIMARY KEY, version_seq INTEGER NOT NULL REFERENCES knowledge_versions(seq),
  action TEXT NOT NULL CHECK(action IN ('add_source','update_source','deprecate','link','add_probe','resolve_gap','activate','rollback')),
  target_id TEXT NOT NULL, reason TEXT NOT NULL, client_id TEXT NOT NULL, client_change_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(client_id,client_change_id)
);
CREATE INDEX knowledge_changes_by_version ON knowledge_changes(version_seq,action,target_id);

-- Update a single version row to switch atomically, with the partial unique index as a second guard.
CREATE TRIGGER knowledge_switch_active BEFORE UPDATE OF status ON knowledge_versions
WHEN NEW.status='active' AND OLD.status<>'active'
BEGIN
  UPDATE knowledge_versions SET status=iif(OLD.status='staged','superseded','rolled_back')
    WHERE status='active' AND seq<>NEW.seq;
END;
