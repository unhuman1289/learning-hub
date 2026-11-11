ALTER TABLE subjects ADD COLUMN opening_brief TEXT;
--> statement-breakpoint
UPDATE subjects SET opening_brief=goal WHERE legacy_track IS NULL AND status='setup' AND revision=0 AND goal<>'';
