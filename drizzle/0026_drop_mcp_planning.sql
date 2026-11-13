DROP TABLE IF EXISTS mcp_event_deliveries;
--> statement-breakpoint
DROP TABLE IF EXISTS mcp_event_subscriptions;
--> statement-breakpoint
DELETE FROM oauthAccessToken
WHERE EXISTS (SELECT 1 FROM json_each(oauthAccessToken.scopes) WHERE value IN ('hub:plan','hub:assess'))
   OR refreshId IN (
     SELECT id FROM oauthRefreshToken
     WHERE EXISTS (SELECT 1 FROM json_each(oauthRefreshToken.scopes) WHERE value IN ('hub:plan','hub:assess'))
   );
--> statement-breakpoint
DELETE FROM oauthRefreshToken
WHERE EXISTS (SELECT 1 FROM json_each(oauthRefreshToken.scopes) WHERE value IN ('hub:plan','hub:assess'));
--> statement-breakpoint
UPDATE oauthConsent SET scopes = (
  SELECT json_group_array(value) FROM json_each(oauthConsent.scopes)
  WHERE value NOT IN ('hub:plan','hub:assess')
)
WHERE EXISTS (SELECT 1 FROM json_each(oauthConsent.scopes) WHERE value IN ('hub:plan','hub:assess'));
