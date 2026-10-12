ALTER TABLE `learner_settings` ADD `role` text DEFAULT 'adult' NOT NULL CHECK (`role` IN ('adult','child'));
--> statement-breakpoint
ALTER TABLE `learner_settings` ADD `display_name` text CHECK (`display_name` IS NULL OR length(`display_name`) BETWEEN 1 AND 40);
--> statement-breakpoint
ALTER TABLE `learner_settings` ADD `explain_language` text DEFAULT 'vi' NOT NULL;
--> statement-breakpoint
ALTER TABLE `learner_settings` ADD `preferences` text DEFAULT '{}' NOT NULL CHECK (length(`preferences`) <= 2048);
--> statement-breakpoint
ALTER TABLE `learner_settings` ADD `ai_budget` text;
--> statement-breakpoint
CREATE TABLE `guardians` (
	`guardian_id` text NOT NULL,
	`learner_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`guardian_id`, `learner_id`),
	CHECK (`guardian_id` <> `learner_id`)
);
--> statement-breakpoint
CREATE INDEX `guardians_learner_idx` ON `guardians` (`learner_id`);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`title` text NOT NULL CHECK (length(`title`) BETWEEN 1 AND 80),
	`template` text NOT NULL CHECK (`template` IN ('skill','reading')),
	`sensitivity` text DEFAULT 'normal' NOT NULL CHECK (`sensitivity` IN ('normal','clinical','child_dev')),
	`goal` text DEFAULT '' NOT NULL CHECK (length(`goal`) <= 2000),
	`level` text DEFAULT '' NOT NULL CHECK (length(`level`) <= 200),
	`curriculum` text DEFAULT '' NOT NULL CHECK (length(`curriculum`) <= 500),
	`limits` text DEFAULT '{"maxDifficulty":3,"allowNewTopics":true,"maxNewSkillsPerWeek":5}' NOT NULL,
	`weight` integer DEFAULT 3 NOT NULL CHECK (`weight` BETWEEN 1 AND 5),
	`status` text DEFAULT 'setup' NOT NULL CHECK (`status` IN ('setup','active','paused','archived')),
	`ai_enabled` integer DEFAULT 0 NOT NULL CHECK (`ai_enabled` IN (0,1)),
	`legacy_track` text CHECK (`legacy_track` IS NULL OR `legacy_track` IN ('Deutsch','AI','MTB','Cardio','Bột')),
	`progress_summary` text DEFAULT '' NOT NULL CHECK (length(`progress_summary`) <= 3000),
	`progress_updated_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_learner_title_unique` ON `subjects` (`learner_id`, `title`);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_learner_legacy_unique` ON `subjects` (`learner_id`, `legacy_track`) WHERE `legacy_track` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL REFERENCES `subjects`(`id`) ON DELETE CASCADE,
	`learner_id` text NOT NULL,
	`key` text NOT NULL CHECK (length(`key`) BETWEEN 1 AND 80),
	`name` text NOT NULL CHECK (length(`name`) BETWEEN 1 AND 120),
	`description` text DEFAULT '' NOT NULL CHECK (length(`description`) <= 500),
	`path_order` integer DEFAULT 0 NOT NULL,
	`prerequisites` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL CHECK (`status` IN ('planned','active','retired')),
	`origin` text NOT NULL CHECK (`origin` IN ('ai','user','migration')),
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_subject_key_unique` ON `skills` (`subject_id`, `key`);
--> statement-breakpoint
CREATE INDEX `skills_learner_idx` ON `skills` (`learner_id`);
--> statement-breakpoint
CREATE TABLE `learner_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`subject_id` text REFERENCES `subjects`(`id`) ON DELETE SET NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('explore','extra_practice','school_topic','note')),
	`text` text NOT NULL CHECK (length(`text`) BETWEEN 1 AND 2000),
	`urgency` text DEFAULT 'tonight' NOT NULL CHECK (`urgency` IN ('tonight','now')),
	`created_by` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL CHECK (`status` IN ('queued','in_job','done','declined','expired')),
	`active_until` text,
	`result_lesson_id` text,
	`response_note` text,
	`job_id` text,
	`created_at` text NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE INDEX `learner_requests_learner_status_idx` ON `learner_requests` (`learner_id`, `status`);
--> statement-breakpoint
INSERT INTO `subjects` (`id`, `learner_id`, `title`, `template`, `sensitivity`, `legacy_track`, `status`, `ai_enabled`, `created_by`, `created_at`, `updated_at`)
SELECT 'sub_' || lower(hex(randomblob(10))), p.`user_id`, p.`track`,
	CASE p.`track` WHEN 'Deutsch' THEN 'skill' ELSE 'reading' END,
	CASE p.`track` WHEN 'MTB' THEN 'clinical' WHEN 'Cardio' THEN 'clinical' WHEN 'Bột' THEN 'child_dev' ELSE 'normal' END,
	p.`track`, 'active', 0, 'migration', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (SELECT DISTINCT `user_id`, `track` FROM `learning_lessons` WHERE `track` IN ('Deutsch','AI','MTB','Cardio','Bột')) AS p;
