ALTER TABLE `learning_lessons` ADD COLUMN `automation_reviewed_at` text;
--> statement-breakpoint
ALTER TABLE `run_items` RENAME TO `legacy_run_items`;
--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`contract_version` text NOT NULL CHECK (`contract_version` = '1'),
	`trigger` text NOT NULL CHECK (`trigger` IN ('scheduled', 'manual')),
	`runner_name` text NOT NULL,
	`runner_version` text NOT NULL,
	`runner_model` text NOT NULL,
	`idempotency_key` text,
	`request_hash` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('created', 'context_served', 'finished', 'failed', 'expired')),
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`context_hash` text,
	`context_json` text,
	`result_hash` text,
	`result_json` text,
	`finished_at` text,
	`error` text,
	UNIQUE (`client_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `automation_runs_created_idx` ON `automation_runs` (`created_at` DESC);
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
CREATE TABLE `run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`type` text NOT NULL CHECK (`type` IN ('created', 'context_served', 'result_accepted', 'failed', 'expired')),
	`detail` text NOT NULL DEFAULT '{}',
	FOREIGN KEY (`run_id`) REFERENCES `automation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_events_run_time_idx` ON `run_events` (`run_id`, `occurred_at`);
--> statement-breakpoint
CREATE TRIGGER `run_events_append_only_update` BEFORE UPDATE ON `run_events` BEGIN SELECT RAISE(ABORT, 'run_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `run_events_append_only_delete` BEFORE DELETE ON `run_events` BEGIN SELECT RAISE(ABORT, 'run_events is append-only'); END;
