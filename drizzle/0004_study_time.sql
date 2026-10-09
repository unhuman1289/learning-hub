CREATE TABLE `learner_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`daily_target_minutes` integer DEFAULT 60 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_time` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`track` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`user_id`, `day`, `track`)
);
