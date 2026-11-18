ALTER TABLE tutor_turns ADD COLUMN off_topic integer NOT NULL DEFAULT 0 CHECK (off_topic IN (0,1));
