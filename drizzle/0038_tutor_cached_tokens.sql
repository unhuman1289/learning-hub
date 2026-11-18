ALTER TABLE tutor_turns ADD COLUMN cached_tokens INTEGER CHECK(cached_tokens IS NULL OR cached_tokens >= 0);
