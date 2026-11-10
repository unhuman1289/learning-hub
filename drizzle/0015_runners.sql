-- Runners on the family Mac (docs/plan/LOCAL-GRADER.md L1.2). Jobs with photos go only to runners that can read
-- images; presence lets the learner UI say "Máy chấm đang tắt" instead of "Đang chấm…".
ALTER TABLE `ai_jobs` ADD COLUMN `needs_vision` integer NOT NULL DEFAULT 0 CHECK (`needs_vision` IN (0,1));
--> statement-breakpoint
UPDATE `ai_jobs` SET `needs_vision`=1 WHERE `kind`='assess' AND `purpose`='submission' AND EXISTS(SELECT 1 FROM `attempts` a WHERE a.`submission_id`=`ai_jobs`.`ref_id` AND a.`attachment_ids`<>'[]');
--> statement-breakpoint
UPDATE `ai_jobs` SET `needs_vision`=1 WHERE `kind`='assess' AND `purpose`='recheck' AND EXISTS(SELECT 1 FROM `disputes` d JOIN `attempts` a ON a.`id`=d.`attempt_id` WHERE d.`id`=`ai_jobs`.`ref_id` AND a.`attachment_ids`<>'[]');
--> statement-breakpoint
CREATE TABLE `runner_presence` (
	`client_id` text PRIMARY KEY NOT NULL,
	`runner` text NOT NULL CHECK (length(`runner`) <= 400),
	`capabilities` text NOT NULL DEFAULT '[]' CHECK (json_valid(`capabilities`)),
	`last_seen_at` text NOT NULL
);
