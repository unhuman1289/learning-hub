-- Photos of handwritten solutions (docs/hub2/DATA-MODEL.md §2.3). Kept 30 days, then removed by the
-- R2 lifecycle rule; deleted_at is set by the nightly cron. Images are not part of D1 backups.
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`attempt_id` text,
	`r2_key` text NOT NULL UNIQUE,
	`mime` text NOT NULL CHECK (`mime` IN ('image/jpeg','image/png','image/webp')),
	`bytes` integer NOT NULL CHECK (`bytes` BETWEEN 1 AND 3000000),
	`width` integer NOT NULL CHECK (`width` BETWEEN 1 AND 2400),
	`height` integer NOT NULL CHECK (`height` BETWEEN 1 AND 2400),
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `attachments_learner_created_idx` ON `attachments` (`learner_id`, `created_at`);
