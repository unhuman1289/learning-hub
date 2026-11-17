ALTER TABLE tutor_turns ADD COLUMN input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens >= 0);
ALTER TABLE tutor_turns ADD COLUMN output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens >= 0);
ALTER TABLE tutor_turns ADD COLUMN attempt_token TEXT;
ALTER TABLE tutor_turns ADD COLUMN lease_expires_at TEXT;
CREATE INDEX tutor_turns_daily ON tutor_turns(learner_id,created_at);
