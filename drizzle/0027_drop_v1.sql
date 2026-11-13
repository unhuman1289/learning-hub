DROP TRIGGER IF EXISTS learning_lessons_v1_subject;
--> statement-breakpoint
DROP INDEX IF EXISTS learning_lessons_v1_track_day_unique;
--> statement-breakpoint
CREATE TABLE _v1_integrity_guard (ok INTEGER NOT NULL CHECK (ok = 1));
--> statement-breakpoint
CREATE TABLE _v1_keep_lessons AS SELECT * FROM learning_lessons WHERE package_version <> 1;
--> statement-breakpoint
DROP TABLE run_events;
--> statement-breakpoint
DROP TABLE run_items;
--> statement-breakpoint
DROP TABLE run_targets;
--> statement-breakpoint
DROP TABLE automation_runs;
--> statement-breakpoint
DROP TABLE legacy_run_items;
--> statement-breakpoint
DROP TABLE runs;
--> statement-breakpoint
DROP TABLE learning_slots;
--> statement-breakpoint
DROP TABLE learning_runs;
--> statement-breakpoint
DROP TABLE learning_workspace;
--> statement-breakpoint
DELETE FROM learning_lessons WHERE package_version = 1;
--> statement-breakpoint
INSERT INTO _v1_integrity_guard
SELECT (SELECT count(*) FROM _v1_keep_lessons) = (SELECT count(*) FROM learning_lessons)
  AND NOT EXISTS (SELECT * FROM _v1_keep_lessons EXCEPT SELECT * FROM learning_lessons)
  AND NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check);
--> statement-breakpoint
DROP TABLE _v1_keep_lessons;
--> statement-breakpoint
DROP TABLE _v1_integrity_guard;
