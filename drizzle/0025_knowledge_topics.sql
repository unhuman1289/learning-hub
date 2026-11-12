CREATE INDEX subjects_topic_key ON subjects(topic_key) WHERE topic_key IS NOT NULL;
UPDATE subjects SET topic_key=CASE
 WHEN lower(title) LIKE '%rust%' THEN 'rust'
 WHEN lower(title) LIKE '%python%' THEN 'python'
 WHEN lower(title) LIKE '%deutsch%' OR lower(title) LIKE '%german%' OR instr(title,'Tiếng Đức')>0 OR instr(title,'tiếng Đức')>0 THEN 'de-cefr'
 WHEN lower(title) LIKE '%english%' OR instr(title,'Tiếng Anh')>0 THEN 'en-cefr'
 WHEN instr(lower(title),'toán 7')>0 OR instr(title,'Toán 7')>0 THEN 'vn-gdpt-toan-7'
 ELSE NULL END
WHERE topic_key IS NULL AND status<>'archived';
ALTER TABLE knowledge_links ADD COLUMN topic_key TEXT;
ALTER TABLE knowledge_gaps ADD COLUMN topic_key TEXT;
ALTER TABLE knowledge_gaps ADD COLUMN step_id TEXT;
ALTER TABLE knowledge_probes ADD COLUMN topic_key TEXT;
UPDATE knowledge_links SET topic_key=(SELECT topic_key FROM subjects WHERE id=subject_id);
UPDATE knowledge_gaps SET topic_key=(SELECT topic_key FROM subjects WHERE id=subject_id);
UPDATE knowledge_probes SET topic_key=(SELECT topic_key FROM subjects WHERE id=subject_id);
CREATE INDEX knowledge_links_by_topic ON knowledge_links(topic_key,note_id) WHERE topic_key IS NOT NULL;
CREATE INDEX knowledge_gaps_by_topic ON knowledge_gaps(topic_key,status,priority,created_at);
