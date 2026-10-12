-- Rebuild learning_lessons for Learning Hub 2.0 (docs/hub2/DATA-MODEL.md §2.2): per-notebook lessons,
-- several slots a day (primary, review, extra), drafts and support per item. Every row, id and answer is kept.
PRAGMA defer_foreign_keys = true;
--> statement-breakpoint
CREATE TABLE `learning_lessons_new` (
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
	`package_version` text DEFAULT '1' NOT NULL CHECK (`package_version` IN ('1','2')),
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
	`origin_job_id` text,
	UNIQUE(`user_id`, `id`),
	CHECK (`package_version` = '2' OR `track` IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `learning_lessons_new` (`id`, `user_id`, `track`, `payload`, `assigned_date`, `completed_at`, `response`, `updated`, `automation_reviewed_at`, `subject_id`, `est_minutes`)
SELECT l.`id`, l.`user_id`, l.`track`, l.`payload`, l.`assigned_date`, l.`completed_at`, l.`response`, l.`updated`, l.`automation_reviewed_at`,
	(SELECT s.`id` FROM `subjects` s WHERE s.`learner_id` = l.`user_id` AND s.`legacy_track` = l.`track`),
	CASE WHEN json_valid(l.`payload`) AND typeof(json_extract(l.`payload`, '$.minutes')) = 'integer' THEN json_extract(l.`payload`, '$.minutes') END
FROM `learning_lessons` l;
--> statement-breakpoint
-- Children of learning_lessons are copied aside and recreated afterwards, so dropping the old table
-- neither cascades (learning_slots) nor leaves deferred foreign-key violations (run_targets, run_items).
CREATE TABLE `_copy_learning_slots` AS SELECT * FROM `learning_slots`;
--> statement-breakpoint
CREATE TABLE `_copy_run_targets` AS SELECT * FROM `run_targets`;
--> statement-breakpoint
CREATE TABLE `_copy_run_items` AS SELECT * FROM `run_items`;
--> statement-breakpoint
DROP TABLE `run_items`;
--> statement-breakpoint
DROP TABLE `run_targets`;
--> statement-breakpoint
DROP TABLE `learning_slots`;
--> statement-breakpoint
DROP TABLE `learning_lessons`;
--> statement-breakpoint
ALTER TABLE `learning_lessons_new` RENAME TO `learning_lessons`;
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
INSERT INTO `learning_slots` (`user_id`, `track`, `lesson_id`, `revision`) SELECT `user_id`, `track`, `lesson_id`, `revision` FROM `_copy_learning_slots`;
--> statement-breakpoint
INSERT INTO `run_targets` (`run_id`, `target_id`, `user_id`, `track`, `current_lesson_id`, `eligible`, `eligibility`, `context_json`)
SELECT `run_id`, `target_id`, `user_id`, `track`, `current_lesson_id`, `eligible`, `eligibility`, `context_json` FROM `_copy_run_targets`;
--> statement-breakpoint
INSERT INTO `run_items` (`run_id`, `target_id`, `action`, `outcome`, `reason`, `lesson_id`, `payload`)
SELECT `run_id`, `target_id`, `action`, `outcome`, `reason`, `lesson_id`, `payload` FROM `_copy_run_items`;
--> statement-breakpoint
DROP TABLE `_copy_learning_slots`;
--> statement-breakpoint
DROP TABLE `_copy_run_targets`;
--> statement-breakpoint
DROP TABLE `_copy_run_items`;
--> statement-breakpoint
CREATE INDEX `learning_lessons_user_assigned_idx` ON `learning_lessons` (`user_id`, `assigned_date` DESC);
--> statement-breakpoint
-- Automation v1 (INSERT OR IGNORE) keeps its one-lesson-per-track-per-day guarantee.
CREATE UNIQUE INDEX `learning_lessons_v1_track_day_unique` ON `learning_lessons` (`user_id`, `track`, `assigned_date`) WHERE `package_version` = '1';
--> statement-breakpoint
-- v2: at most one primary lesson and one review set per notebook per Berlin day.
CREATE UNIQUE INDEX `learning_lessons_v2_slot_day_unique` ON `learning_lessons` (`user_id`, `subject_id`, `assigned_date`, `slot`) WHERE `package_version` = '2' AND `slot` IN ('primary','review');
--> statement-breakpoint
CREATE INDEX `learning_lessons_subject_idx` ON `learning_lessons` (`subject_id`, `assigned_date` DESC);
--> statement-breakpoint
-- Lessons written by automation v1 or a restore get their notebook from the legacy track.
CREATE TRIGGER `learning_lessons_v1_subject` AFTER INSERT ON `learning_lessons`
WHEN NEW.`subject_id` IS NULL AND NEW.`track` IS NOT NULL
BEGIN
	UPDATE `learning_lessons` SET `subject_id` = (SELECT `id` FROM `subjects` WHERE `learner_id` = NEW.`user_id` AND `legacy_track` = NEW.`track`) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TABLE `lesson_items` (
	`lesson_id` text NOT NULL REFERENCES `learning_lessons`(`id`) ON DELETE CASCADE,
	`item_id` text NOT NULL CHECK (`item_id` GLOB 'i[0-9]*' AND length(`item_id`) <= 3),
	`learner_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`stage` text NOT NULL CHECK (`stage` IN ('retrieval','guided','independent','analyze','output','check')),
	`activity` text NOT NULL CHECK (`activity` IN ('recall','recognize','correct','transform','apply','explain','create','investigate')),
	`input_kind` text NOT NULL CHECK (`input_kind` IN ('choice','short','long')),
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
CREATE INDEX `lesson_items_learner_subject_idx` ON `lesson_items` (`learner_id`, `subject_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `lesson_items_prompt_hash_idx` ON `lesson_items` (`learner_id`, `subject_id`, `prompt_hash`);
