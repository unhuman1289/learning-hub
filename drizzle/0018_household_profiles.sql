-- Family profiles instead of accounts (docs/plan/LOCAL-GRADER.md L5). A profile is a row in `user` (ids unchanged);
-- the household gate is Cloudflare Access or a shared passphrase. Personal and notebook prompts reach the AI runners.
ALTER TABLE `learner_settings` ADD `personal_prompt` text DEFAULT '' NOT NULL CHECK (length(`personal_prompt`) <= 4000);
--> statement-breakpoint
ALTER TABLE `learner_settings` ADD `avatar` text DEFAULT '' NOT NULL CHECK (length(`avatar`) <= 16);
--> statement-breakpoint
ALTER TABLE `subjects` ADD `instructions` text DEFAULT '' NOT NULL CHECK (length(`instructions`) <= 4000);
--> statement-breakpoint
CREATE TABLE `household_settings` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`manage_pin_sha256` text CHECK (`manage_pin_sha256` IS NULL OR length(`manage_pin_sha256`) = 64),
	`updated_at` text NOT NULL
);
