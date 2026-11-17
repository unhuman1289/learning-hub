-- Reserved Speech attempts persist across Queue deliveries and concurrent turns.
ALTER TABLE ai_jobs ADD COLUMN speech_calls INTEGER NOT NULL DEFAULT 0 CHECK(speech_calls >= 0);
