CREATE TABLE mcp_event_subscriptions (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),client_id TEXT NOT NULL REFERENCES oauthClient(clientId),
 kind TEXT NOT NULL CHECK(kind IN ('plan','assess')),callback_url TEXT NOT NULL,secret_cipher TEXT NOT NULL,
 created_at TEXT NOT NULL,verified_at TEXT NOT NULL,expires_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE INDEX mcp_event_subscription_owner ON mcp_event_subscriptions(user_id,client_id);
CREATE TABLE mcp_event_deliveries (
 subscription_id TEXT NOT NULL REFERENCES mcp_event_subscriptions(id),job_id TEXT NOT NULL REFERENCES ai_jobs(id),
 status TEXT NOT NULL CHECK(status IN ('pending','delivered','stopped')),attempts INTEGER NOT NULL DEFAULT 0,
 next_at TEXT NOT NULL,delivered_at TEXT,PRIMARY KEY(subscription_id,job_id)
);
