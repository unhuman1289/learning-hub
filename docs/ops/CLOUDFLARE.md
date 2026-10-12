# Cloudflare foundation checklist

Updated 10 October 2026 after the owner-authorized production cutover. The checklist and phase notes below retain the 9 October readiness observations; the current live state is recorded in the final section.

## P0.0 — account and decisions

| Item | Observed state | Next step |
| --- | --- | --- |
| Cloudflare account and zone | Signed in; `unhuman.cc` is Active, registrar Cloudflare, Free plan; DNS Setup shows Full | Ready |
| `learn.unhuman.cc` DNS | CNAME to `custom-domains.chatgpt.site`, DNS only. `quest.unhuman.cc` uses a proxied Tunnel. | Still serves Sites. The owner authorized cutover; replace the CNAME only after the final export, production email credential, and minimum production auth/data checks are ready. |
| Zero Trust | Free plan activated at $0/month, 0 of 50 seats used. Team domain is now `unhuman-lab.cloudflareaccess.com`. The requested `unhuman.cloudflareaccess.com` was already claimed by another account. | Do not use for learner sign-in. Configure Service Auth for the automation route in P0.5 after standalone auth. |
| R2 | Subscription active at $0/month base. Dedicated staging bucket `learning-hub-backups-staging` created in WEUR; Worker binding is private. The owner downloaded a real staging backup and verified the local restore drill. | A successful `system:scheduled` backup still needs to be recorded; the manual backup does not prove the cron ran. |
| Learner sign-in | On 08/10/2026, owner chose Learning Hub accounts with email + password; Google and Access OTP are not desired. Policy revised 09/10/2026: public signup, email verification, then admin approval; no per-person allowlist. | Staging implementation uses an admin-only approval card. Production cutover is authorized but not complete. |
| Google IdP | Not configured; no longer needed for learner sign-in. | No action. |
| Access applications | None exist. The Access dashboard is empty. | Per the updated plan, create only App B Service Auth for `learn-staging.unhuman.cc/api/automation/*` in P0.5. Do not attach human Access login to `learn.unhuman.cc`. |
| GitHub Cloudflare secrets | Both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` exist in private repository `unhuman1289/learning-hub`. | Token `learning-hub-github-deploy` expires 2027-10-08. Its permissions are Workers Scripts Write, D1 Write and Workers R2 Storage Write at account scope, plus Workers Routes Write scoped to `unhuman.cc`. Token value is stored only as the GitHub secret. |

The staging Worker, staging/production D1 databases, and both backup buckets are created. Zero Trust Free and R2 were activated after the account owner accepted overage terms; the account payment method may be charged if usage exceeds the included allowances. No Access application was created, and no DNS record has changed.

## P0.1 — Sites snapshot

A private, mode-0600, restore-capable snapshot is stored locally at `private-data/sites-export-2026-10-09.json`, with method and verification notes in `private-data/sites-export-2026-10-09-provenance.txt`. Neither file belongs in Git.

The private snapshot `private-data/sites-export-2026-10-09.json` records Site v5 source commit `ed5cdc0a2b7e86b899f0810690a4de4033908d47`, 5 lessons, 2 runs, 5 slots, and 1 workspace. It was combined from owner-only Sites database reads and an earlier complete export; it is **not** a byte-for-byte native export. A fresh read on 09/10 found 5 lessons, 3 runs, 5 slots, and 1 workspace, but the tool truncates each current lesson payload. On 09/10 the owner chose this available snapshot as the cutover baseline and said no fresh Sites sync is needed. Known difference: one run record and current lesson payload changes are not in this baseline. The current Site remains intact for rollback.

The snapshot was restored into isolated local D1 at `.wrangler/state-snapshot-2026-10-09`; every saved snapshot cell matched on read-back. The user-supplied legacy JSON remains unverified and was not used. Keep the previous full export until a native, untruncated Site export can replace this reconstruction.

## P0.2 — Worker and D1 configuration

- Staging D1: `learning-hub-staging` (`6f2f1df1-1dcd-4810-8812-1c6e4d7ef1d5`), location `weur`.
- Production D1: `learning-hub-prod` (`545cedea-a4a5-4bdb-b370-8d447fe0833c`), location `weur`; migrations `0000`–`0006` are applied. Read-only counts on 09/10 before the accepted snapshot import showed 0 lessons, 0 slots, 0 workspace rows, 0 learning runs, and 0 users. `PRAGMA foreign_key_check` returned no rows.
- The Worker version `fce294f1-41a3-40e3-a0ca-c9fa9377b9d1` and its dormant status describe the 9 October provisioning snapshot. Production R2 bucket `learning-hub-backups-production` exists in WEUR. The initial manual pre-cutover SQL snapshot is stored at `manual/production-precutover-2026-10-09.sql`; it downloaded byte-for-byte and passed an isolated SQLite restore drill. The current Worker and verified import backups are recorded in the cutover section below.
- `wrangler.jsonc` now configures production `APP_ORIGIN=https://learn.unhuman.cc`, `EMAIL_FROM=Learning Hub <no-reply@notify.unhuman.cc>`, the `learn.unhuman.cc` Custom Domain, private R2 bindings, and the UTC cron pair filtered in code to 03:00 Europe/Berlin. `workers.dev` remains enabled as a fallback.
- Production secret names observed from Cloudflare (values were not read) are `BETTER_AUTH_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, and `RESEND_API_KEY`. All three are present; the owner verified admin login before cutover.

## P0.3 — staging spike

- Worker: `learning-hub-staging`, https://learning-hub-staging.tranvu-812.workers.dev
- Current Worker version: `b88e7b9c-0bd0-48ac-a5c5-5e789b80297f`, deployed 9 October 2026 with learner-scoped progress and the v1 automation API code.
- Confirmed by `wrangler secret list --env staging` (names/types only; values not read): `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and `BOOTSTRAP_ADMIN_EMAIL` remain as `secret_text`. Obsolete `ALLOWED_SIGNUP_EMAILS` was removed from staging.
- Staging variables are set to `APP_ORIGIN=https://learning-hub-staging.tranvu-812.workers.dev` and `EMAIL_FROM=Learning Hub <no-reply@notify.unhuman.cc>`; values are non-secret configuration. Worker bindings show D1 `learning-hub-staging` and R2 `learning-hub-backups-staging`.
- Migrations `0000`–`0005` are applied. Before `0004`/`0005`, D1 had 3 accounts (1 admin), 5 lessons, 5 slots, and 2 learning runs. The private SQL export `manual/pre-p1-20261009T202830Z.sql` was saved to the staging R2 bucket and verified by downloading it byte-for-byte; its local ignored copy is `private-data/staging-pre-p1-20261009T202830Z.sql`. After migration, a comparison against that pre-migration export matched every existing cell in lessons, slots, workspace, learning runs, legacy runs, legacy run items, and backup events; `PRAGMA foreign_key_check` returned no rows.
- Staging's imported D1 differs from the older snapshot for one lesson's `completed_at`, `response`, and `updated` fields; the pre-migration export proves those staging values were already present before the learner-scope migration. A fresh live Sites read on 09/10 matched the older snapshot for those three fields. The unresolved discrepancy is the truncated lesson payloads, not those fields.
- Post-deploy smoke passed: `/api/health` reports staging and connected D1; anonymous `/` redirects to `/login`; `/login`, `/register`, and `/forgot-password` return 200; `/api/daily` and `/api/export` return 401 even with forged Sites identity headers; `/api/learning-run` returns 410. `/api/automation/v1/schema` returns 503 because automation authorization is not configured, so the new automation routes fail closed.
- Isolated local Worker + throwaway D1 smoke passed public signup (200), admin pending-user list (200), cross-origin approval rejection (403), forged-header API rejection (401), login/logout and D1 progress read/write after a fresh login. Staging smoke also passed after deployment: all account pages are available; admin approval endpoints return 401 without a session. A real email verification and approval for a second account remains a browser acceptance step.
- The prior 48-hour/CPU p95 gate is removed by the 09/10 decision. CPU p95 is unmeasured and remains an observation after deploy, not a launch blocker.

As of the 9 October readiness snapshot, `learn.unhuman.cc` still pointed to Sites v5 and the production Worker had no active hostname. That is historical; the 10 October production cutover is recorded below. Staging has a manual backup button for admin and a scheduled backup at 03:00 Europe/Berlin. A manual staging R2 object exists; a successful scheduled backup still needs independent confirmation.

## Phase 1 staging deployment — 09/10/2026

- Local source now contains learner-scoped daily progress (`0004_learner_scope.sql`), automation auth/state schema (`0005_automation.sql`), scoped Cloudflare Access JWT + bearer authorization, v1 run/context/result/fail/schema routes, compact pseudonymous context, and a guarded D1 assignment writer.
- These changes are deployed to staging only. `npm run test` (49), `npm run typecheck`, `npm run lint`, and `npm run build` all pass. A private snapshot migration drill also passes locally.
- Access Service Auth, `AUTOMATION_ACCESS_AUD`, and `AUTOMATION_CLIENTS` are not configured. Automation endpoints return 503 until those controls are configured and tested; do not connect a runner yet.
- Gate 0 remains open: the owner still needs to test the corrected reset-password browser flow, and a successful `system:scheduled` R2 backup plus a restore drill of current migrated staging must be recorded. Automation authorization also remains unconfigured. The owner has since authorized expedited production cutover; no DNS change has been made.
- A lesson runner, admin run-status API, full staging acceptance, and cutover are still pending. Current Worker cron backs up D1 only; it does not create daily lessons.

## Expedited production cutover — 09/10/2026

- Owner authorized moving `learn.unhuman.cc` now. This supersedes the planned timing, not the requirement to preserve learning data or provide working authentication.
- Production infrastructure is provisioned: D1 schema `0000`–`0005`, dormant Worker deployment, R2 backup bucket, and production `APP_ORIGIN`/`EMAIL_FROM` configuration. No production learners or learning data were found. A manual empty-database backup is stored in production R2 and passes isolated SQLite restore checks.
- The owner accepted `private-data/sites-export-2026-10-09.json` as the baseline; the local learner-migration drill retained every source cell (5 lessons, 5 slots, 1 workspace, 2 runs). The owner knowingly deferred syncing the newer live Site payloads and third empty run. The Site project and its scheduled task were left intact during cutover; only its custom-domain DNS mapping was removed.
- On 9 October, production lacked `RESEND_API_KEY` and an admin account. The owner subsequently configured the key, verified admin login on the production Worker, and requested the cutover; the present state and checks are recorded below.
- Cloudflare Custom Domains automatically provisions DNS/TLS and requires a conflicting CNAME to be removed first. The owner removed the Sites CNAME during the 10 October cutover, then Wrangler attached the Worker and provisioned TLS.

## Production custom-domain cutover — 10/10/2026

- The owner removed the `learn.unhuman.cc` CNAME to `custom-domains.chatgpt.site`. Wrangler attached `learn.unhuman.cc` as a Custom Domain to Worker `learning-hub-prod`; `workers.dev` remains enabled as a fallback. Production `APP_ORIGIN` is now `https://learn.unhuman.cc`.
- Worker version `3a47d0a4-59ba-43fb-8a28-a1e9e843e2ed` serves the UI from `main` (`bd4cddc`) together with the preserved local infrastructure/auth changes. No Git commit or push was made during deployment.
- Production D1 migrations `0000`–`0006` are applied. The accepted private Sites snapshot was imported and verified: 5 lessons, 5 slots, 1 workspace, and 2 learning runs. The imported dataset reflects the owner's chosen 9 October snapshot, not a fresh Sites sync. Pre-import and post-import SQL backups were uploaded to the production R2 bucket and byte-compared after download.
- Public smoke checks on `https://learn.unhuman.cc`: `/` redirects to `/login`; `/login`, `/register`, and `/forgot-password` return 200; `/api/health` reports production with D1 connected; anonymous `/api/state` returns 401. The CSS and JavaScript assets return 200. `curl` verifies TLS and `openssl s_client` reports a valid chain (Google Trust Services, TLS 1.3, verify code 0).
- The owner must sign in again on `learn.unhuman.cc`; the existing session on `workers.dev` is host-scoped. The former ChatGPT Site and its data were not deleted.
- Scheduled Worker runs continue to create D1 backups only. Daily lesson generation is not implemented/configured as a successful Worker run, and automation endpoints remain fail-closed until their service authorization is configured.
