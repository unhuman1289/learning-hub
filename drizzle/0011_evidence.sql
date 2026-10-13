CREATE TABLE submissions (
 id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, lesson_id TEXT NOT NULL REFERENCES learning_lessons(id), stage TEXT,
 client_submission_id TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('grading','graded','deferred','failed')),
 ai_job_id TEXT, created_at TEXT NOT NULL, graded_at TEXT, UNIQUE(learner_id,client_submission_id)
);
CREATE TABLE attempts (
 id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), learner_id TEXT NOT NULL,
 lesson_id TEXT NOT NULL, item_id TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES subjects(id),
 skill_ids TEXT NOT NULL, activity TEXT NOT NULL, attempt_no INTEGER NOT NULL CHECK(attempt_no>0), retry_of TEXT REFERENCES attempts(id),
 answer TEXT NOT NULL CHECK(length(answer)<=8000), attachment_ids TEXT NOT NULL DEFAULT '[]',
 support TEXT NOT NULL CHECK(support IN ('none','hint1','hint2','solution')), context TEXT NOT NULL CHECK(context IN ('lesson','review','check')),
 status TEXT NOT NULL CHECK(status IN ('pending','graded','disputed','void')), current_grade_id TEXT,
 day TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(lesson_id,item_id) REFERENCES lesson_items(lesson_id,item_id), UNIQUE(lesson_id,item_id,attempt_no)
);
CREATE INDEX attempts_learner_subject_day ON attempts(learner_id,subject_id,day);
CREATE INDEX attempts_lesson_item ON attempts(lesson_id,item_id);
CREATE TABLE grades (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), grader TEXT NOT NULL CHECK(grader IN ('auto','ai','guardian','admin')),
 job_id TEXT, result TEXT NOT NULL CHECK(result IN ('correct','partial','incorrect','ungradable')), score REAL NOT NULL CHECK(score>=0 AND score<=1),
 rubric_scores TEXT NOT NULL DEFAULT '[]', feedback TEXT NOT NULL CHECK(length(feedback)<=1500), correction TEXT NOT NULL DEFAULT '',
 errors TEXT NOT NULL DEFAULT '[]', superseded_by TEXT REFERENCES grades(id), created_at TEXT NOT NULL
);
CREATE TABLE disputes (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), grade_id TEXT NOT NULL REFERENCES grades(id), learner_id TEXT NOT NULL,
 raised_by TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('answer_correct','feedback_wrong','item_wrong','other')),
 message TEXT NOT NULL CHECK(length(message)<=1000), recheck_requested INTEGER NOT NULL DEFAULT 0 CHECK(recheck_requested IN (0,1)),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','rechecking','upheld','overturned','item_void','needs_human','closed')),
 resolution_grade_id TEXT REFERENCES grades(id), resolved_by TEXT, resolution_note TEXT, created_at TEXT NOT NULL, resolved_at TEXT
);
