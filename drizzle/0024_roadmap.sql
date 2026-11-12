ALTER TABLE subjects ADD COLUMN framework TEXT;
ALTER TABLE subjects ADD COLUMN topic_key TEXT;
ALTER TABLE subjects ADD COLUMN roadmap_replan INTEGER NOT NULL DEFAULT 0 CHECK(roadmap_replan IN (0,1));
ALTER TABLE learning_lessons ADD COLUMN step_role TEXT CHECK(step_role IS NULL OR step_role IN ('intro','practice','challenge','placement'));

CREATE TABLE roadmap_steps (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  ord REAL NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  objective TEXT NOT NULL CHECK(length(objective)<=500),
  situation TEXT NOT NULL DEFAULT '' CHECK(length(situation)<=300),
  skill_ids TEXT NOT NULL CHECK(json_valid(skill_ids) AND json_array_length(skill_ids) BETWEEN 1 AND 3),
  requires TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(requires)),
  band INTEGER NOT NULL CHECK(band BETWEEN 1 AND 5),
  level_label TEXT,
  kind TEXT NOT NULL DEFAULT 'new' CHECK(kind IN ('new','review','mixed')),
  status TEXT NOT NULL CHECK(status IN ('planned','open','practising','passed','placed','retired')),
  passed_via TEXT CHECK(passed_via IS NULL OR passed_via IN ('mastery','challenge','placement','learner')),
  origin TEXT NOT NULL CHECK(origin IN ('ai','user','migration')),
  origin_job_id TEXT,
  opened_at TEXT, passed_at TEXT, retired_reason TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX roadmap_steps_subject ON roadmap_steps(learner_id,subject_id,status,ord);

INSERT INTO roadmap_steps(id,learner_id,subject_id,ord,title,objective,situation,skill_ids,band,kind,status,origin,opened_at,created_at,updated_at)
SELECT s.id||':s'||(j.key+1),s.learner_id,s.id,j.key+1,substr(trim(json_extract(j.value,'$.title')),1,160),
  substr(coalesce(json_extract(j.value,'$.objective'),''),1,500),substr(coalesce(json_extract(j.value,'$.situation'),''),1,300),
  json_extract(j.value,'$.skills'),2,
  CASE json_extract(j.value,'$.mode') WHEN 'review' THEN 'review' WHEN 'mixed' THEN 'mixed' ELSE 'new' END,
  CASE WHEN l.completed_at IS NOT NULL THEN 'practising' WHEN l.id IS NOT NULL THEN 'open' ELSE 'planned' END,
  'migration',l.updated,s.created_at,s.updated_at
FROM subjects s CROSS JOIN json_each(CASE WHEN json_valid(s.roadmap) THEN s.roadmap ELSE '[]' END) j
LEFT JOIN learning_lessons l ON l.user_id=s.learner_id AND l.subject_id=s.id AND l.roadmap_step_id='step_'||(j.key+1)
WHERE s.status<>'archived' AND j.type='object' AND trim(json_extract(j.value,'$.title'))<>''
 AND json_type(j.value,'$.skills')='array' AND json_array_length(j.value,'$.skills') BETWEEN 1 AND 3
 AND NOT EXISTS(SELECT 1 FROM json_each(j.value,'$.skills') k WHERE NOT EXISTS(
   SELECT 1 FROM skills sk WHERE sk.id=k.value AND sk.subject_id=s.id AND sk.learner_id=s.learner_id
 ));
UPDATE roadmap_steps SET requires=json_array(subject_id||':s'||CAST(ord-1 AS INTEGER))
WHERE EXISTS(SELECT 1 FROM roadmap_steps prior WHERE prior.subject_id=roadmap_steps.subject_id AND prior.ord=roadmap_steps.ord-1);
UPDATE learning_lessons SET roadmap_step_id=subject_id||':s'||substr(roadmap_step_id,6),step_role='intro'
WHERE roadmap_step_id GLOB 'step_[0-9]*' AND EXISTS(
 SELECT 1 FROM roadmap_steps r WHERE r.id=learning_lessons.subject_id||':s'||substr(learning_lessons.roadmap_step_id,6)
 AND r.learner_id=learning_lessons.user_id);
DROP INDEX adaptive_roadmap_introduction;
CREATE UNIQUE INDEX adaptive_roadmap_introduction ON learning_lessons(user_id,subject_id,roadmap_step_id)
 WHERE roadmap_step_id IS NOT NULL AND (step_role IS NULL OR step_role='intro');
CREATE INDEX roadmap_lesson_roles ON learning_lessons(user_id,subject_id,roadmap_step_id,step_role,assigned_date);
UPDATE subjects SET roadmap_replan=1
WHERE legacy_track IS NULL AND status='active' AND NOT EXISTS(SELECT 1 FROM roadmap_steps WHERE subject_id=subjects.id);
CREATE TABLE _roadmap_integrity_guard(ok INTEGER CHECK(ok=1));
INSERT INTO _roadmap_integrity_guard SELECT NOT EXISTS(
  SELECT 1 FROM roadmap_steps r JOIN subjects s ON s.id=r.subject_id WHERE r.learner_id<>s.learner_id
) AND NOT EXISTS(
  SELECT 1 FROM learning_lessons l WHERE l.step_role='intro' AND NOT EXISTS(
    SELECT 1 FROM roadmap_steps r WHERE r.id=l.roadmap_step_id AND r.subject_id=l.subject_id AND r.learner_id=l.user_id
  )
);
DROP TABLE _roadmap_integrity_guard;
