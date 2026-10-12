# Sites → Learning Hub staging bridge

Isolated adapter for the existing private Learning Hub Site. It never accesses Sites D1 or the production Hub. `site/lib/hub-bridge.mjs` is server-only and must stay behind Sites authentication; its header trust is **not** suitable for a standalone Worker.

The prepared Site exposes `GET/POST /api/hub-bridge` and `POST /mcp` with five tools: schema, start, context, submit result, read run. Origin is pinned to staging, redirects are never followed, and missing credentials fail closed. The owner can call MCP; invited viewers cannot update Hub. Sites service calls rely on the private Sites dispatch boundary. Do not make this Site public without replacing this authorization.

## Operator setup (no secrets in chat)

Wrangler OAuth could read Access apps but creation returned `403 auth.forbidden` on 10 October 2026. In Cloudflare Zero Trust → Access:

1. Create a service token named `Learning Hub Sites staging`; store its client ID/secret in a password manager.
2. Create a self-hosted application for `learning-hub-staging.tranvu-812.workers.dev/api/automation/*`. Use a **Service Auth** policy containing only that service token. Keep the rest of the site outside Access.
3. Copy its non-secret audience tag to staging `AUTOMATION_ACCESS_AUD`. Issuer remains `https://unhuman-lab.cloudflareaccess.com`.
4. Generate a separate bearer secret; configure `AUTOMATION_CLIENTS` following `docs/ops/AUTOMATION-CREDENTIALS.md`, with scopes `runs:create`, `context:read`, `result:write`. Keep plaintext only in the Site secret and password manager.
5. In Sites runtime settings set secrets `HUB_BRIDGE_BEARER` (full `lhk_<clientId>_<secret>`), `HUB_BRIDGE_ACCESS_CLIENT_ID`, `HUB_BRIDGE_ACCESS_CLIENT_SECRET`; non-secret `HUB_BRIDGE_OWNER_EMAIL` is the Site owner's verified email. Never put these in source or prompts.
6. Apply pending staging migration only after a staging backup; deploy staging with the existing project wrapper. Publish the prepared Site without changing its audience or custom domain. Use its actual `.chatgpt.site` origin, never `learn.unhuman.cc` for Sites service credentials.

## Acceptance before changing the old schedule

First call schema; test missing Access/bearer layers and viewer rejection. Start one manual run with a unique stable idempotencyKey, read context, submit **only `no_action` items** with the exact contextHash, then read the same run. Confirm terminal state, no assigned lessons and unchanged lesson/answer/slot rows. Test replay and a conflicting result. Then test new lesson assignment with a dedicated staging learner, never a real learner's unfinished lesson.

A fresh **cloud** task must discover/call these MCP tools and verify the saved result. Publishing, local fixtures or an existing enabled schedule do not prove this. Keep the old 03:00 task unchanged until the replacement is verified; update the existing schedule rather than creating a duplicate. Daily mode and provider metadata still need a reviewed extension beyond this manual spike. D1 remains the only transactional learning source. No model API is used.

## Verified state — 10 October 2026

- All 60 Hub tests passed, including six adapter security tests; Hub typecheck passed. Sites source typecheck and build passed.
- Live GET to staging schema with invalid credentials returned 503 (authorization not configured). No live run or lesson write was attempted.
- Source was pushed to the existing Sites source repository as `d1e7173d5a4f8577e3d3104a9e3b81c09fa0fae3`; saved **version 6** ID `appgprj_6ac5fd4aa4a8819188c4fabae021727f~appgver_756107f10de48191a9b84f7c50b25cc9`. Archive `/private/tmp/learning-hub-sites-bridge.tar.gz`. It is **not deployed**; v5 remains live.
- Sites runtime owner-email setting was prepared at revision 1; no bridge credentials were stored. It applies only after deployment.
- Publication was rejected by automatic review because AGENTS.md forbids further Sites publishing and the user had not explicitly approved publishing this bridge. Do not work around that rejection.
- Existing Sites custom-domain records still include learn.unhuman.cc and learning.unhuman.cc. DNS currently routes learn.unhuman.cc to the independent Hub. Reconcile Sites hostname selection before any service call; never send Sites authorization to the Hub origin.
- Old 03:00 schedule was not changed. No staging migration, Hub deployment, DNS change or production data change occurred.

## Publication approved and completed — 10 October 2026 08:01 UTC

The owner explicitly approved publishing v6 for the staging bridge while preserving DNS and the production Hub. Deployment `appgdep_6ac9f0c72d688191a21dd4c378e146b6` succeeded with MCP enabled and environment revision 1 at `https://learning.unhuman12.chatgpt.site`. MCP resource is `https://learning.unhuman12.chatgpt.site/mcp`; connected plugin ID is `plugin_asdk_app_sites_da6c198397288191804f27db2b18311d`. The preceding saved-only/rejection entry describes the earlier state. Automation credentials remain missing; no daily schedule change or Hub write is confirmed.

Hosted checks after publication: GET `/api/hub-bridge` with Sites service access reached the application and returned 503 `bridge_not_configured` with the three missing key names. POST `/mcp` with that same service bypass header returned 401 at platform access; it is not an authenticated MCP connection test. MCP must use the provisioned plugin/OAuth resource. Tool discovery/calls from a fresh cloud task remain unverified.

AUD supplied by owner screenshot: `7c55439963964a7cb0a0597600f7fad2f932b80bbd650703aca1f321e0e751ef`. Prepared only in local staging variables; no deploy. Access apps and service-token list APIs for account `03ac082aa559d875efc61952bc38954d` returned HTTP 200, success true, but empty lists. Wrangler OAuth lacks explicit Access scopes, so this does not independently establish whether the UI app is unsaved, belongs to another account, or is not visible to this credential. Confirm account and saved app/policy before deploying or configuring credentials.

## Staging round trip verified — 10 October 2026

Sites runtime revision 2 contains the three bridge secrets; v6 was redeployed without changing audience or DNS. Worker staging now has AUD and AUTOMATION_CLIENTS, migration 0006, and version `e3e70cf3-414e-43ff-a185-64f6d4e94669`. Through the actual connected plugin, schema/start/context/no_action result/readback succeeded. Idempotent replay succeeded and conflicting replay returned 409. Missing either credential layer was denied. Five tracks retained their lessons; SQL comparison confirmed only automation_reviewed_at changed. Detailed evidence: docs/VALIDATION.md. This supersedes earlier missing-credential notes; schedule and production integration remain pending.
