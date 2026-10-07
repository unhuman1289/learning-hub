CREATE TABLE `backup_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_items` (
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`track` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text NOT NULL,
	`previous_lesson_id` text,
	`lesson_id` text,
	`sources` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`run_id`, `user_id`, `track`),
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`summary` text DEFAULT '' NOT NULL,
	`error` text,
	`origin` text DEFAULT 'scheduled' NOT NULL,
	`request_hash` text
);
