CREATE TABLE `learning_lessons_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track` text NOT NULL,
	`payload` text NOT NULL,
	`assigned_date` text NOT NULL,
	`completed_at` text,
	`response` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL,
	UNIQUE(`user_id`, `track`, `assigned_date`),
	UNIQUE(`user_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `learning_lessons_new` (`id`, `user_id`, `track`, `payload`, `assigned_date`, `completed_at`, `response`, `updated`)
SELECT `id`, (SELECT `id` FROM `user` WHERE `role` = 'admin' ORDER BY `created_at`, `id` LIMIT 1), `track`, `payload`, `assigned_date`, `completed_at`, `response`, `updated`
FROM `learning_lessons`;
--> statement-breakpoint
CREATE TABLE `learning_slots_new` (
	`user_id` text NOT NULL,
	`track` text NOT NULL,
	`lesson_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `track`),
	FOREIGN KEY (`user_id`, `lesson_id`) REFERENCES `learning_lessons_new`(`user_id`, `id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `learning_slots_new` (`user_id`, `track`, `lesson_id`, `revision`)
SELECT l.`user_id`, s.`track`, s.`lesson_id`, s.`revision`
FROM `learning_slots` s JOIN `learning_lessons_new` l ON l.`id` = s.`lesson_id`;
--> statement-breakpoint
DROP TABLE `learning_slots`;
--> statement-breakpoint
DROP TABLE `learning_lessons`;
--> statement-breakpoint
ALTER TABLE `learning_lessons_new` RENAME TO `learning_lessons`;
--> statement-breakpoint
ALTER TABLE `learning_slots_new` RENAME TO `learning_slots`;
--> statement-breakpoint
CREATE INDEX `learning_lessons_user_assigned_idx` ON `learning_lessons` (`user_id`, `assigned_date` DESC);
