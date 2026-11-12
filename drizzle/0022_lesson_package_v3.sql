-- D1 keeps foreign keys enabled during migrations. Snapshot descendants before rebuilding the two CHECK constraints.
-- Preserve rowids for reading order, then verify every row and foreign key before removing the copies.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE "_v3_copy_learning_lessons" AS SELECT rowid AS saved_rowid, * FROM "learning_lessons";
--> statement-breakpoint
CREATE TABLE "_v3_copy_lesson_items" AS SELECT rowid AS saved_rowid, * FROM "lesson_items";
--> statement-breakpoint
CREATE TABLE "_v3_copy_learning_slots" AS SELECT rowid AS saved_rowid, * FROM "learning_slots";
--> statement-breakpoint
CREATE TABLE "_v3_copy_run_targets" AS SELECT rowid AS saved_rowid, * FROM "run_targets";
--> statement-breakpoint
CREATE TABLE "_v3_copy_run_items" AS SELECT rowid AS saved_rowid, * FROM "run_items";
--> statement-breakpoint
CREATE TABLE "_v3_copy_submissions" AS SELECT rowid AS saved_rowid, * FROM "submissions";
--> statement-breakpoint
CREATE TABLE "_v3_copy_attempts" AS SELECT rowid AS saved_rowid, * FROM "attempts";
--> statement-breakpoint
CREATE TABLE "_v3_copy_grades" AS SELECT rowid AS saved_rowid, * FROM "grades";
--> statement-breakpoint
CREATE TABLE "_v3_copy_disputes" AS SELECT rowid AS saved_rowid, * FROM "disputes";
--> statement-breakpoint
CREATE TABLE "_v3_copy_attempt_diagnoses" AS SELECT rowid AS saved_rowid, * FROM "attempt_diagnoses";
--> statement-breakpoint
CREATE TABLE "_v3_copy_lesson_reflections" AS SELECT rowid AS saved_rowid, * FROM "lesson_reflections";
--> statement-breakpoint
DROP TABLE "lesson_reflections";
--> statement-breakpoint
DROP TABLE "attempt_diagnoses";
--> statement-breakpoint
DROP TABLE "disputes";
--> statement-breakpoint
DROP TABLE "grades";
--> statement-breakpoint
DROP TABLE "attempts";
--> statement-breakpoint
DROP TABLE "submissions";
--> statement-breakpoint
DROP TABLE "run_items";
--> statement-breakpoint
DROP TABLE "run_targets";
--> statement-breakpoint
DROP TABLE "learning_slots";
--> statement-breakpoint
DROP TABLE "lesson_items";
--> statement-breakpoint
DROP TABLE "learning_lessons";
--> statement-breakpoint
CREATE TABLE "learning_lessons" (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track` text,
	`payload` text NOT NULL,
	`assigned_date` text NOT NULL,
	`completed_at` text,
	`response` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL,
	`automation_reviewed_at` text,
	`subject_id` text REFERENCES `subjects`(`id`) ON DELETE SET NULL,
	`package_version` text DEFAULT '1' NOT NULL CHECK (`package_version` IN ('1','2','3')),
	`template` text CHECK (`template` IS NULL OR `template` IN ('skill','reading')),
	`kind` text DEFAULT 'legacy' NOT NULL CHECK (`kind` IN ('new','remediation','review','exploration','diagnostic','legacy')),
	`slot` text DEFAULT 'primary' NOT NULL CHECK (`slot` IN ('primary','review','extra')),
	`reason` text DEFAULT '' NOT NULL CHECK (length(`reason`) <= 400),
	`reason_refs` text DEFAULT '[]' NOT NULL,
	`est_minutes` integer,
	`draft` text DEFAULT '{}' NOT NULL,
	`draft_revision` integer DEFAULT 0 NOT NULL,
	`support` text DEFAULT '{}' NOT NULL,
	`snoozed_until` text,
	`origin_job_id` text, roadmap_step_id TEXT,
	UNIQUE(`user_id`, `id`),
	CHECK (`package_version` IN ('2','3') OR `track` IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `lesson_items` (
	`lesson_id` text NOT NULL REFERENCES `learning_lessons`(`id`) ON DELETE CASCADE,
	`item_id` text NOT NULL CHECK (`item_id` GLOB 'i[0-9]*' AND length(`item_id`) <= 3),
	`learner_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`stage` text NOT NULL CHECK (`stage` IN ('retrieval','guided','independent','analyze','output','check')),
	`activity` text NOT NULL CHECK (`activity` IN ('recall','recognize','correct','transform','apply','explain','create','investigate')),
	`input_kind` text NOT NULL CHECK (`input_kind` IN ('choice','short','long','cloze','match','order','label','table','code')),
	`skill_ids` text NOT NULL,
	`difficulty` integer NOT NULL CHECK (`difficulty` BETWEEN 1 AND 5),
	`auto_gradable` integer NOT NULL CHECK (`auto_gradable` IN (0,1)),
	`prompt_hash` text NOT NULL,
	`origin` text DEFAULT 'plan' NOT NULL CHECK (`origin` IN ('plan','assess_check')),
	`payload` text NOT NULL,
	`flag` text CHECK (`flag` IS NULL OR `flag` IN ('key_issue','item_void')),
	`created_at` text NOT NULL,
	PRIMARY KEY(`lesson_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `learning_slots` (
	`user_id` text NOT NULL,
	`track` text NOT NULL,
	`lesson_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `track`),
	FOREIGN KEY (`user_id`, `lesson_id`) REFERENCES `learning_lessons`(`user_id`, `id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `run_targets` (
	`run_id` text NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text NOT NULL,
	`track` text NOT NULL,
	`current_lesson_id` text,
	`eligible` integer NOT NULL CHECK (`eligible` IN (0, 1)),
	`eligibility` text NOT NULL,
	`context_json` text NOT NULL,
	PRIMARY KEY (`run_id`, `target_id`),
	UNIQUE (`run_id`, `user_id`, `track`),
	FOREIGN KEY (`run_id`) REFERENCES `automation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`, `current_lesson_id`) REFERENCES `learning_lessons`(`user_id`, `id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `run_items` (
	`run_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL CHECK (`action` IN ('assign', 'issue', 'no_action')),
	`outcome` text NOT NULL CHECK (`outcome` IN ('assigned', 'kept', 'issue', 'no_action')),
	`reason` text NOT NULL,
	`lesson_id` text,
	`payload` text,
	PRIMARY KEY (`run_id`, `target_id`),
	FOREIGN KEY (`run_id`, `target_id`) REFERENCES `run_targets`(`run_id`, `target_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `learning_lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE submissions (
 id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, lesson_id TEXT NOT NULL REFERENCES learning_lessons(id), stage TEXT,
 client_submission_id TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('grading','graded','deferred','failed')),
 ai_job_id TEXT, created_at TEXT NOT NULL, graded_at TEXT, UNIQUE(learner_id,client_submission_id)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE grades (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), grader TEXT NOT NULL CHECK(grader IN ('auto','ai','guardian','admin')),
 job_id TEXT, result TEXT NOT NULL CHECK(result IN ('correct','partial','incorrect','ungradable')), score REAL NOT NULL CHECK(score>=0 AND score<=1),
 rubric_scores TEXT NOT NULL DEFAULT '[]', feedback TEXT NOT NULL CHECK(length(feedback)<=1500), correction TEXT NOT NULL DEFAULT '',
 errors TEXT NOT NULL DEFAULT '[]', superseded_by TEXT REFERENCES grades(id), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE disputes (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), grade_id TEXT NOT NULL REFERENCES grades(id), learner_id TEXT NOT NULL,
 raised_by TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('answer_correct','feedback_wrong','item_wrong','other')),
 message TEXT NOT NULL CHECK(length(message)<=1000), recheck_requested INTEGER NOT NULL DEFAULT 0 CHECK(recheck_requested IN (0,1)),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','rechecking','upheld','overturned','item_void','needs_human','closed')),
 resolution_grade_id TEXT REFERENCES grades(id), resolved_by TEXT, resolution_note TEXT, created_at TEXT NOT NULL, resolved_at TEXT
);
--> statement-breakpoint
CREATE TABLE attempt_diagnoses (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), job_id TEXT NOT NULL REFERENCES ai_jobs(id),
 learner_id TEXT NOT NULL, errors TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(attempt_id,job_id)
);
--> statement-breakpoint
CREATE TABLE lesson_reflections (
 submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
 learner_id TEXT NOT NULL, lesson_id TEXT NOT NULL REFERENCES learning_lessons(id), subject_id TEXT NOT NULL REFERENCES subjects(id),
 difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','fit','hard')),
 usefulness TEXT NOT NULL CHECK(usefulness IN ('useful','mixed','not_useful')),
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 720),
 note TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO "learning_lessons" (rowid, "id", "user_id", "track", "payload", "assigned_date", "completed_at", "response", "updated", "automation_reviewed_at", "subject_id", "package_version", "template", "kind", "slot", "reason", "reason_refs", "est_minutes", "draft", "draft_revision", "support", "snoozed_until", "origin_job_id", "roadmap_step_id") SELECT saved_rowid, "id", "user_id", "track", "payload", "assigned_date", "completed_at", "response", "updated", "automation_reviewed_at", "subject_id", "package_version", "template", "kind", "slot", "reason", "reason_refs", "est_minutes", "draft", "draft_revision", "support", "snoozed_until", "origin_job_id", "roadmap_step_id" FROM "_v3_copy_learning_lessons";
--> statement-breakpoint
INSERT INTO "lesson_items" (rowid, "lesson_id", "item_id", "learner_id", "subject_id", "stage", "activity", "input_kind", "skill_ids", "difficulty", "auto_gradable", "prompt_hash", "origin", "payload", "flag", "created_at") SELECT saved_rowid, "lesson_id", "item_id", "learner_id", "subject_id", "stage", "activity", "input_kind", "skill_ids", "difficulty", "auto_gradable", "prompt_hash", "origin", "payload", "flag", "created_at" FROM "_v3_copy_lesson_items";
--> statement-breakpoint
INSERT INTO "learning_slots" (rowid, "user_id", "track", "lesson_id", "revision") SELECT saved_rowid, "user_id", "track", "lesson_id", "revision" FROM "_v3_copy_learning_slots";
--> statement-breakpoint
INSERT INTO "run_targets" (rowid, "run_id", "target_id", "user_id", "track", "current_lesson_id", "eligible", "eligibility", "context_json") SELECT saved_rowid, "run_id", "target_id", "user_id", "track", "current_lesson_id", "eligible", "eligibility", "context_json" FROM "_v3_copy_run_targets";
--> statement-breakpoint
INSERT INTO "run_items" (rowid, "run_id", "target_id", "action", "outcome", "reason", "lesson_id", "payload") SELECT saved_rowid, "run_id", "target_id", "action", "outcome", "reason", "lesson_id", "payload" FROM "_v3_copy_run_items";
--> statement-breakpoint
INSERT INTO "submissions" (rowid, "id", "learner_id", "lesson_id", "stage", "client_submission_id", "request_hash", "status", "ai_job_id", "created_at", "graded_at") SELECT saved_rowid, "id", "learner_id", "lesson_id", "stage", "client_submission_id", "request_hash", "status", "ai_job_id", "created_at", "graded_at" FROM "_v3_copy_submissions";
--> statement-breakpoint
INSERT INTO "attempts" (rowid, "id", "submission_id", "learner_id", "lesson_id", "item_id", "subject_id", "skill_ids", "activity", "attempt_no", "retry_of", "answer", "attachment_ids", "support", "context", "status", "current_grade_id", "day", "created_at") SELECT saved_rowid, "id", "submission_id", "learner_id", "lesson_id", "item_id", "subject_id", "skill_ids", "activity", "attempt_no", "retry_of", "answer", "attachment_ids", "support", "context", "status", "current_grade_id", "day", "created_at" FROM "_v3_copy_attempts";
--> statement-breakpoint
INSERT INTO "grades" (rowid, "id", "attempt_id", "grader", "job_id", "result", "score", "rubric_scores", "feedback", "correction", "errors", "superseded_by", "created_at") SELECT saved_rowid, "id", "attempt_id", "grader", "job_id", "result", "score", "rubric_scores", "feedback", "correction", "errors", "superseded_by", "created_at" FROM "_v3_copy_grades";
--> statement-breakpoint
INSERT INTO "disputes" (rowid, "id", "attempt_id", "grade_id", "learner_id", "raised_by", "reason", "message", "recheck_requested", "status", "resolution_grade_id", "resolved_by", "resolution_note", "created_at", "resolved_at") SELECT saved_rowid, "id", "attempt_id", "grade_id", "learner_id", "raised_by", "reason", "message", "recheck_requested", "status", "resolution_grade_id", "resolved_by", "resolution_note", "created_at", "resolved_at" FROM "_v3_copy_disputes";
--> statement-breakpoint
INSERT INTO "attempt_diagnoses" (rowid, "id", "attempt_id", "job_id", "learner_id", "errors", "created_at") SELECT saved_rowid, "id", "attempt_id", "job_id", "learner_id", "errors", "created_at" FROM "_v3_copy_attempt_diagnoses";
--> statement-breakpoint
INSERT INTO "lesson_reflections" (rowid, "submission_id", "learner_id", "lesson_id", "subject_id", "difficulty", "usefulness", "minutes", "note", "revision", "created_at", "updated_at") SELECT saved_rowid, "submission_id", "learner_id", "lesson_id", "subject_id", "difficulty", "usefulness", "minutes", "note", "revision", "created_at", "updated_at" FROM "_v3_copy_lesson_reflections";
--> statement-breakpoint
CREATE INDEX `learning_lessons_user_assigned_idx` ON `learning_lessons` (`user_id`, `assigned_date` DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_lessons_v1_track_day_unique` ON `learning_lessons` (`user_id`, `track`, `assigned_date`) WHERE `package_version` = '1';
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_lessons_v2_slot_day_unique` ON `learning_lessons` (`user_id`, `subject_id`, `assigned_date`, `slot`) WHERE `package_version` IN ('2','3') AND `slot` IN ('primary','review');
--> statement-breakpoint
CREATE INDEX `learning_lessons_subject_idx` ON `learning_lessons` (`subject_id`, `assigned_date` DESC);
--> statement-breakpoint
CREATE TRIGGER `learning_lessons_v1_subject` AFTER INSERT ON `learning_lessons`
WHEN NEW.`subject_id` IS NULL AND NEW.`track` IS NOT NULL
BEGIN
	UPDATE `learning_lessons` SET `subject_id` = (SELECT `id` FROM `subjects` WHERE `learner_id` = NEW.`user_id` AND `legacy_track` = NEW.`track`) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE INDEX `lesson_items_learner_subject_idx` ON `lesson_items` (`learner_id`, `subject_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `lesson_items_prompt_hash_idx` ON `lesson_items` (`learner_id`, `subject_id`, `prompt_hash`);
--> statement-breakpoint
CREATE INDEX attempts_learner_subject_day ON attempts(learner_id,subject_id,day);
--> statement-breakpoint
CREATE INDEX attempts_lesson_item ON attempts(lesson_id,item_id);
--> statement-breakpoint
CREATE INDEX attempts_submission ON attempts(submission_id);
--> statement-breakpoint
CREATE INDEX grades_attempt ON grades(attempt_id);
--> statement-breakpoint
CREATE INDEX grades_job ON grades(job_id);
--> statement-breakpoint
CREATE INDEX disputes_attempt ON disputes(attempt_id);
--> statement-breakpoint
CREATE INDEX lesson_reflections_context ON lesson_reflections(learner_id,subject_id,updated_at);
--> statement-breakpoint
CREATE UNIQUE INDEX adaptive_roadmap_introduction ON learning_lessons(user_id,subject_id,roadmap_step_id) WHERE roadmap_step_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "_v3_integrity_guard" (ok INTEGER NOT NULL CHECK(ok=1));
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "learning_lessons") = (SELECT count(*) FROM "_v3_copy_learning_lessons") AND NOT EXISTS (SELECT * FROM "_v3_copy_learning_lessons" EXCEPT SELECT rowid, * FROM "learning_lessons");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "lesson_items") = (SELECT count(*) FROM "_v3_copy_lesson_items") AND NOT EXISTS (SELECT * FROM "_v3_copy_lesson_items" EXCEPT SELECT rowid, * FROM "lesson_items");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "learning_slots") = (SELECT count(*) FROM "_v3_copy_learning_slots") AND NOT EXISTS (SELECT * FROM "_v3_copy_learning_slots" EXCEPT SELECT rowid, * FROM "learning_slots");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "run_targets") = (SELECT count(*) FROM "_v3_copy_run_targets") AND NOT EXISTS (SELECT * FROM "_v3_copy_run_targets" EXCEPT SELECT rowid, * FROM "run_targets");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "run_items") = (SELECT count(*) FROM "_v3_copy_run_items") AND NOT EXISTS (SELECT * FROM "_v3_copy_run_items" EXCEPT SELECT rowid, * FROM "run_items");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "submissions") = (SELECT count(*) FROM "_v3_copy_submissions") AND NOT EXISTS (SELECT * FROM "_v3_copy_submissions" EXCEPT SELECT rowid, * FROM "submissions");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "attempts") = (SELECT count(*) FROM "_v3_copy_attempts") AND NOT EXISTS (SELECT * FROM "_v3_copy_attempts" EXCEPT SELECT rowid, * FROM "attempts");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "grades") = (SELECT count(*) FROM "_v3_copy_grades") AND NOT EXISTS (SELECT * FROM "_v3_copy_grades" EXCEPT SELECT rowid, * FROM "grades");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "disputes") = (SELECT count(*) FROM "_v3_copy_disputes") AND NOT EXISTS (SELECT * FROM "_v3_copy_disputes" EXCEPT SELECT rowid, * FROM "disputes");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "attempt_diagnoses") = (SELECT count(*) FROM "_v3_copy_attempt_diagnoses") AND NOT EXISTS (SELECT * FROM "_v3_copy_attempt_diagnoses" EXCEPT SELECT rowid, * FROM "attempt_diagnoses");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT (SELECT count(*) FROM "lesson_reflections") = (SELECT count(*) FROM "_v3_copy_lesson_reflections") AND NOT EXISTS (SELECT * FROM "_v3_copy_lesson_reflections" EXCEPT SELECT rowid, * FROM "lesson_reflections");
--> statement-breakpoint
INSERT INTO "_v3_integrity_guard" SELECT NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check);
--> statement-breakpoint
DROP TABLE "_v3_integrity_guard";
--> statement-breakpoint
DROP TABLE "_v3_copy_learning_lessons";
--> statement-breakpoint
DROP TABLE "_v3_copy_lesson_items";
--> statement-breakpoint
DROP TABLE "_v3_copy_learning_slots";
--> statement-breakpoint
DROP TABLE "_v3_copy_run_targets";
--> statement-breakpoint
DROP TABLE "_v3_copy_run_items";
--> statement-breakpoint
DROP TABLE "_v3_copy_submissions";
--> statement-breakpoint
DROP TABLE "_v3_copy_attempts";
--> statement-breakpoint
DROP TABLE "_v3_copy_grades";
--> statement-breakpoint
DROP TABLE "_v3_copy_disputes";
--> statement-breakpoint
DROP TABLE "_v3_copy_attempt_diagnoses";
--> statement-breakpoint
DROP TABLE "_v3_copy_lesson_reflections";
