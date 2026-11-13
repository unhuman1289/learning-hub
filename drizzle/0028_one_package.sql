UPDATE learning_lessons
SET payload = json_set(payload, '$.contract', 'lesson-package/3', '$.knowledge', json('[]')),
    package_version = 3
WHERE package_version = 2;
--> statement-breakpoint
UPDATE subjects
SET limits = json_set(coalesce(nullif(limits, ''), '{}'), '$.package', 3)
WHERE coalesce(json_extract(limits, '$.package'), 2) <> 3;
