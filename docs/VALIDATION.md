# Export verification — 07/10/2026

- Live Sites v5 source SHA matches the imported Git history: `ed5cdc0a2b7e86b899f0810690a4de4033908d47`.
- Complete lesson payloads obtained through the authenticated learning-run API; bounded table previews alone were truncated and were not used as full lesson backups.
- Restored local D1 matches every exported cell: 5 lessons, 5 slots, 1 run, 1 workspace. Snapshot is ignored by Git.
- Existing SQLite policy tests: 2 passed, including Berlin DST, completion cutoff, separate tracks, stale retry protection and retained answers.
- TypeScript, ESLint and Vinext production build passed.
- Chrome desktop (1440px) and mobile (390px): 5 current cards render, lesson reader opens, gray/pink tokens match, no document horizontal overflow.
- No API calls or daily writes were made against production during verification; only read-only exports. Production deployment, domain and schedule unchanged.
- No automatic Docs sync, independent Cloudflare auth/deployment or Claude task has been configured in this export.

The snapshot is a point-in-time backup, not a live replica. Re-export at future migration cutover.

## Phase 0 — 07/10/2026

- 8 tests pass: original DST/completion invariants plus per-attempt journals, same-payload replay, conflicting retry, stalled/stale warnings, source issues, atomic rollback and full backup restoration.
- Typecheck, ESLint and production build pass locally. Git diff has no whitespace errors; no private snapshot, answers, runtime data or temporary test is tracked.
- Chrome 1440px desktop and 390px mobile: five active lessons/answers unchanged by a manual empty-proposal run; readback uses the same runId; replay does not duplicate a run; invalid API data returns 400 and unsigned backup requests return 401. No page error or horizontal overflow.
- The backup button downloaded a format-2 snapshot. `npm run db:migrate:local` and `npm run db:restore:local` restored it into isolated local D1. All cells match in seven tables: workspace 1, lessons 5, slots 5, legacy daily run 1, new run 1, run items 5, backup event 1.
- Impeccable detector ran once on changed UI targets; its three warnings refer to existing accent borders outside the new run-status styling. Those historical styles are left for the planned phase-1 UI cleanup.
- [GitHub PR CI rejection check](https://github.com/unhuman1289/learning-hub/actions/runs/37633696510): the deliberate assertion failure made the PR red, while all eight product tests passed. The temporary probe is removed from the final source.
- Production publication, live task prompt, Email and three real nights remain unverified. Sites get_site returned NOT_FOUND and list_sites returned an empty list. A local manual run and local restore do not satisfy the nightly gate.

## Phase 0 staging — 09/10/2026

- Owner confirmed staging login, logout/login, and that saved answers remain after a new session. Auth confirmation email has been received; the reset-password email flow is still awaiting an owner-operated check.
- The owner downloaded the staging R2 backup and ran `npm run db:restore:drill`. It restored into a fresh in-memory SQLite database and verified 7 tables: workspace 1, lessons 5, slots 5, learning runs 2, legacy runs 0, run items 0, backup event 1. The exact object was also readable from the private staging R2 bucket. No existing D1 data was overwritten.
- GitHub Actions push run [37975728541](https://github.com/unhuman1289/learning-hub/actions/runs/37975728541) passed on commit `8da6d1ba0d952e9fb9c3c8a7ee0dca0301565d21`: `npm ci`, 25 tests, typecheck, lint and production build.
- `learn.unhuman.cc`, production D1, DNS and Sites remain unchanged. Phase 1 is not started until the remaining Gate 0 email-reset check is confirmed.

## Phase 1 implementation and staging deployment — 09/10/2026

- `npm run test`: 49 passed, 0 failed; includes per-learner privacy, migration/backfill, Cloudflare Access service-token verification, Automation API state transitions, idempotency, expiry, context hashing, stale-write rejection, answer retention, and clinical/contact-data safeguards.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed. Lint excludes `.claude/worktrees/**`, a saved historical worktree with unrelated pre-existing lint failures.
- `npm run db:drill:learner-migration -- --file private-data/sites-export-2026-10-09.json`: all original cells matched after applying `0004`/`0005` in isolated SQLite; no remote D1 writes.
- `npm run db:restore:drill -- --file private-data/sites-export-2026-10-09.json`: restore verified in a fresh in-memory SQLite database; no private export or learner values were printed.
- Staging deployment: Worker version `b88e7b9c-0bd0-48ac-a5c5-5e789b80297f`; D1 migrations `0004` and `0005` applied. The private pre-migration SQL export `manual/pre-p1-20261009T202830Z.sql` was uploaded to staging R2 and downloaded for byte-for-byte verification. Every pre-existing cell matched after migration across lessons, slots, workspace, learning runs, legacy runs/items, and backup events; `PRAGMA foreign_key_check` returned no rows.
- Staging smoke: `/api/health` reports `environment=staging` and connected D1; `/` redirects to `/login`; `/login`, `/register`, `/forgot-password` return 200; forged Sites headers do not bypass `/api/daily` or `/api/export` (401); `/api/learning-run` returns 410. Automation schema returns 503 while Access service authorization is unconfigured.
- The earlier Sites snapshot comparison differs for one lesson's `completed_at`, `response`, and `updated` fields. The comparison against the immediate pre-migration D1 export proves these live values were retained; refresh/reconcile the source snapshot before production import.
- No production Worker, migration, secret update, DNS change, or Sites cutover occurred. Gate 0 remains open: owner browser check of reset-password, scheduled backup plus current-state restore drill, and Access Service Auth/automation credential setup remain pending.

## Sites bridge staging acceptance — 10 October 2026

Owner supplied staging credentials through hidden terminal input; values were loaded privately and configured in Sites runtime revision 2 and staging `AUTOMATION_CLIENTS`. Sites v6 deployment `appgdep_6aca18eccc608191b7570dff3c99e1c9` succeeded. Staging migration 0006 applied after full SQL backup. Staging Worker version `e3e70cf3-414e-43ff-a185-64f6d4e94669` uses the staging D1/R2 bindings and owner-supplied AUD.

Corrected Access JWT validation to require a signed app token, exact issuer/audience/client ID and empty subject; absent identity-only `service_token_status` is allowed, explicit false is rejected. 60 tests, typecheck, relevant lint and staging deploy/build passed. Official claim reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/ .

Live plugin calls: schema 200; manual start/context/result/readback completed for run `11f32d75-0ebe-41a8-a9db-2b9dcc00df53`, five no_action outcomes and no new lesson IDs. Identical result replay 200/replayed true; conflicting replay 409; final readback remained finished. Initial POST after rollout returned 401; the same idempotency key subsequently succeeded. No automatic retries were added.

Auth boundaries: neither key 403, bearer only 403, Access only 401, both 200; service keys on learner `/api/state` 401. Staging smoke passed all login pages/assets and rejected forged Sites identity headers on learner/admin APIs.

Full SQL before/after exports compared in isolated SQLite. Workspace, slots and legacy learning runs unchanged; every lesson field unchanged except `automation_reviewed_at`, the intentional checked timestamp. Content, exercises, answers and completion remained unchanged. Private backups: `private-data/staging-pre-bridge-2026-10-10.sql` and `private-data/staging-post-bridge-2026-10-10.sql` (never committed).

This proves a manual non-AI MCP-to-staging round trip. Fresh scheduled cloud task, new lesson assignment with a dedicated learner, actual daily provider metadata, three-night operation, production bridge credentials and production update are still pending. Old 03:00 schedule, production Worker/D1 and DNS were not changed. Gate 1 is not claimed complete.

## H0.1 — production deploy từ `main` (12/10/2026)

- Commit `3a564c9` (PR #75), Worker `learning-hub-prod`, version `e51fe9ef-6e75-4c3b-bc49-512b3c6eaca2` (trước đó `3a47d0a4`, deploy từ working tree).
- Trước deploy: `d1_migrations` staging và production = `0000`–`0006`, khớp journal; sao lưu R2 `daily-2026-10-12` lúc 01:00 UTC; không có migration mới.
- Smoke `learn.unhuman.cc`: `/api/health` ok, production, D1 connected; `/` 307 → login; `/login`, `/register` 200; `/api/daily`, `/api/export`, `/api/study` 401 kể cả với header `oai-authenticated-user-*` giả; `/api/learning-run` 410; `/api/automation/v1/schema` 503 (automation vẫn tắt trên production).
- Số dòng trước và sau giống nhau: lessons 5, slots 5, workspace 1, users 2, study_time 4, learner_settings 0, learning_runs 2, automation_runs 0.
