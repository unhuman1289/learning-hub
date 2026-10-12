-- The household workspace (notes, journal, milestones, "done" marks) becomes the first admin's own workspace.
-- Other learners start empty; each account now reads and writes only its own row (docs/hub2 D15).
DELETE FROM `learning_workspace`
WHERE `owner` = (SELECT `id` FROM `user` WHERE `role` = 'admin' ORDER BY `created_at`, `id` LIMIT 1)
  AND EXISTS (SELECT 1 FROM `learning_workspace` WHERE `owner` = '__shared_family_workspace__');
--> statement-breakpoint
UPDATE `learning_workspace`
SET `owner` = (SELECT `id` FROM `user` WHERE `role` = 'admin' ORDER BY `created_at`, `id` LIMIT 1)
WHERE `owner` = '__shared_family_workspace__'
  AND EXISTS (SELECT 1 FROM `user` WHERE `role` = 'admin');
