CREATE TABLE `learning_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`track` text NOT NULL,
	`payload` text NOT NULL,
	`assigned_date` text NOT NULL,
	`completed_at` text,
	`response` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_runs` (
	`day` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_slots` (
	`track` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
