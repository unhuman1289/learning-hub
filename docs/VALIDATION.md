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

## H1 — production: migration 0007, 0008 và deploy (12/10/2026)

- Commit `8a7e7ec` (H1.1–H1.7, PR #78–#84), Worker `learning-hub-prod` version `3d915049-87fc-408c-8862-5d3339b981e5` (trước đó `e51fe9ef`).
- Trước khi áp: sao lưu R2 `daily-2026-10-12`; lessons 5, slots 5, workspace 1, users 2, study_time 4, learner_settings 0.
- Áp `0007_subjects`, `0008_workspace_per_user`: dữ liệu học không đổi (lessons 5, slots 5, workspace 1, study_time 4). Tạo 5 sổ từ 5 mảng cũ của admin (Deutsch `skill`; AI `reading`; MTB, Cardio `reading` + `clinical`; Bột `reading` + `child_dev`), đều `active`, `ai_enabled = 0`. Workspace chung (rỗng) chuyển cho admin đầu tiên.
- Smoke `learn.unhuman.cc`: `/api/health` ok; `/` 307 → login; `/login`, `/register` 200; `/api/daily`, `/api/state`, `/api/study`, `/api/subjects`, `/api/learners`, `/api/learners/me/settings`, `/api/admin/family`, `/api/export` 401 kể cả với header `oai-authenticated-user-*` giả; `/api/learning-run` 410; `/api/automation/v1/schema` 503 (automation vẫn tắt).

## H2.5–H3.4 — 13/10/2026, local et migration staging

- Isolated worktree `hub2-lessons-submissions`, branch `codex/hub2-h2-h3`, base main `6393544` (H2.4). Original dirty Phase 1 checkout preserved.
- 140 SQLite/unit tests pass; typecheck, lint, contracts:check and build pass. More than 40 auto-grading cases; replay/retry, support, completion/undo, stale revision/race, private desk summaries and fractional-grade backup round trip covered.
- Local HTTP acceptance (`scripts/hub2-local-smoke.mjs`): email/password sign-in, anonymous 401, other learner 404, wrong origin 403, guardian/admin read only, D1 draft, auto grade, replay, retry, completion/undo, sign-out/sign-in answer and latest-grade persistence pass. Synthetic demo only.
- Browser local: exact DOM widths 375 and 1280 px, no document overflow; phone one question with previous/next; keyboard Enter opens lesson and moves between questions. Correct/incorrect feedback, saved answer readback and second attempt visible. Network emulation: failed save showed Chưa lưu and kept text; reconnect + explicit Save confirmed Đã lưu. Error copy localized after this check. Input body font 16 px.
- Impeccable mechanical detector on all nine added reader components returned `[]`. Screenshot proof saved privately (demo only), not committed.
- Migration 0011 drill on actual staging SQL export: all 25 existing tables hashed identically before/after, four new empty tables, foreign_key_check clean. Export kept private, not in Git.
- Full staging pre-migration SQL stored in R2 `learning-hub-backups-staging/h3/2026-10-13-before-0011.sql`; downloaded readback matches original bytes.
- Only pending staging migration was 0011; applied successfully. No production migration/deploy or DNS changes. Existing uploads staging lifecycle: `uploads/` expires after 30 days.
- H3.5/Gate A remains open: parent review and real Ếch one-week use of at least three lessons on phone/desktop required. Demo tests do not satisfy this. No AI grading, disputes workflow, learner-model updates or daily content runner in this release.

### Staging acceptance H2/H3

- Source code `acecb84`, deployed staging version `eee8376d-07d4-416a-9a86-8ef79d3f1b45`; HUB2_ENABLED true. No staging migrations pending. Secret names checked only; values never read or displayed.
- Anonymous/forged-identity smoke: health/D1 200, login/register/reset pages and CSS/JS available, anonymous home 307, retired Sites endpoint 410, all 16 protected probes 401 (including new lesson/submission/import routes).
- Authenticated real staging (`hub2-staging-smoke.mjs`): generated learner fixtures only. Login, D1 draft, correct auto grade, open-item pending, server hint support, UUID replay, retry link, other learner 404, wrong origin 403, non-admin import 403, completion/undo and logout/login persistence pass. Signup/Resend not retested in this release. Test users blocked, sessions expired, subject archived afterwards; real learner rows untouched.
- Post-migration learning backup: 2 submissions, 4 attempts, 3 grades restored and compared cell-for-cell in fresh SQLite along with all other learning tables. Format-4 snapshot uploaded to R2 and download compared byte-for-byte; no existing database overwritten. SQL export including auth kept private separately.
- Local positive admin import HTTP probe passes: valid 201, invalid package 422 with paths, unfinished lesson 409; non-admin 403. Wrangler local proxy was observed aborting a subsequent POST after a denied large-body request when switching test identities. Negative authorization probe is isolated at the end of the local harness; this preview-transport issue is not evidence of data loss and is retained here as a QA limitation. Live staging positive admin import remains a manual review check (no test admin added).
- Production read-only health 200, `production-admin-bootstrap`, D1 connected. This H2/H3 release has not been deployed there.

### Final H2/H3 patch

- Interpreter-only v2 schema validation avoids runtime code generation in Workers. Expanded privacy validation covers instructions, explanations, rubric text, knowledge-sheet notes/checklists and source descriptions as well as prompts. Six identifying-data mutation cases are blocked; ordinary fixture remains valid.
- Reader now shows the concrete output in independent work and the next topic. 141 tests, typecheck, lint, contracts and build pass for this patch; prior staging authenticated acceptance remains recorded above.
- Staging version `1abed8ed-404d-4b05-8e4c-4e41dd633bb4` corresponds to source `b388f4f`; anonymous/forged-header smoke passed again. Subsequent deployment of this patch is staging-only. PR #90 holds the reviewed source and CI evidence.

### H2/H3 staging final acceptance — source 649b2f9

- Final staging version: `6beaf3c9-14ce-44da-9a3c-5008ca6a1f0e`. Both final GitHub CI checks passed (141 tests, typecheck, lint, contracts, build).
- Repeated anonymous/forged-header smoke and authenticated synthetic-learner acceptance on this version: all listed checks passed again; generated QA accounts blocked and sessions expired afterwards. No pending staging migrations.
- Still pending: positive import using the real staging admin, parent-reviewed content and the one-week Ếch pilot. H3.5/Cổng A remains open. No production deployment or DNS changes in this task.

## Deutsch người lớn — unhuman, 13/10/2026

- Nội dung mới, không đổi Worker/runtime: `deutsch-adult-01-termin.json`, 40 phút, 8 câu, nguồn Goethe HTML thực sự mở; prompt chuẩn bị/tutor/lịch prepare-only. Không triển khai H5/H7 hoặc production.
- Real staging admin dùng panel Giao bài đã duyệt, server trả `les_8b52eae6ba6b4eee8fb4`. Reload dashboard thấy bài; reader mở đủ 4 phần, chưa trả lời/nộp/đánh dấu hoàn thành thay người học. Đây là positive admin import thực đầu tiên của đợt H2/H3.
- Read-only D1 đối chiếu: bài mới package 2, 8 lesson_items, completed_at NULL, response rỗng. Bài v1 07/10 vẫn có completed_at 09/10 và response dài 48 ký tự như trước. Không đọc nội dung câu trả lời hoặc ghi SQL.
- 141 tests, typecheck, contracts:check đạt; gói bài kiểm validator với maxDifficulty 3. Không build/deploy mới vì chỉ đổi tài liệu/nội dung nhập qua API đã deploy.
- Câu mở chưa được AI chấm; plugin vẫn chỉ v1 staging. Goal/level trong D1 của sổ Deutsch còn trống, khác mục tiêu hiển thị tĩnh ở UI; profile hiện nằm trong prompt/bài đã duyệt, cần đưa vào context v2 ở H5. Dashboard còn thông báo hoàn thành Deutsch từ bài v1 bên cạnh bài v2 chưa xong; reader/bài v2 là trạng thái đúng, cần sửa thông báo ở đợt UI sau.
- Cổng A vẫn cần phụ huynh duyệt bài và pilot Ếch một tuần. Positive import của người lớn không thay thế điều kiện đó.

## H4–H5 implementation and staging — 13/10/2026

- User changed Gate A to unhuman/Deutsch and authorized H4–H5 local/staging immediately; real-user acceptance remains required before production.
- Local D1: all 14 migrations applied; full build passed (owner terminal and agent rebuild). 210 tests pass; typecheck, ESLint and contract schema check pass.
- Staging D1 0012/0013 applied after a SQL export and in-memory migration drill: all cells in 29 previous tables unchanged, foreign key check passed. Private export is outside Git.
- Staging Worker version `0e370c2b-2aa8-45f3-aad9-38123991cb01`, `APP_VERSION=hub2-h4-h5-2026-10-13`. Queue producer `learning-hub-ai-staging` attached; no model API/consumer or subscription task configured.
- Local and HTTPS staging E2E PASS: sign in → plan dry-run/write/readback → save draft → submit → fake assess → skill application state → completion/undo → sign out/in → saved answer and incomplete state preserved. Synthetic QA only, scoped service client; no real learner answer was graded or completed.
- Staging QA E2E lesson `les_2997e7cc081752b29418`, submission `subm_f05ce769bbd09d3ff91c`. These are temporary test artifacts, not authored content for unhuman.
- Alerts distinguish a once-per-day general digest from the urgent 06:00 missing-plan warning; missing cron jobs are detected. Uncertain email delivery is not retried. Tests use fake Resend; actual overnight delivery not yet witnessed.
- H5.9 measurements completed with a concrete cost/performance proposal below; QA cleanup was executed after tests. H6 recheck decisions/explorations are deliberately rejected until their writers and user workflows exist.
- Production code/config/DNS and real staging lessons remain unchanged. No ChatGPT task or real AI grading is implied by a succeeded fake job.

### H5.9 CPU measurements and remaining risk

Actual Wrangler tail CPU values (single/few synthetic invocations, not p95):

| Work | Payload | CPU ms | Result |
| --- | --- | ---: | --- |
| Small plan lease | ordinary fixture | 6 | 200 |
| Large context before fix | 3 × 120 skills | 1557 | 200 |
| Large context after incremental truncation | 130654 bytes, 81 truncation markers | 122 cold / 48 warm | 200 |
| Read large context | 130654 bytes | 6 warm | 200 |
| Validate plan (dry run) | 3 × 97792-byte lessons | 186 | 200 |
| Apply plan | 3 subjects / 42 items | 192 | 200; all 3 persisted |

Cloudflare's [published Free limit](https://developers.cloudflare.com/workers/platform/limits/) is 10ms, with occasional overrun flexibility. Successful responses above 10ms do not establish a reliable Free operating envelope. No billing-plan change was made; the actual account plan was not checked. H5.9 has measurements and a specific proposal, not a claim that maximal workloads fit Free.

Proposed next step before production AI: use one subject per plan job, cap working context to 32KB and ordinary lesson payload to 12KB, precompute/cache learner summaries, and measure these bounded cases with realistic Deutsch content. Keep the 96/128KB protocol caps for compatibility but reject/route heavy workloads deliberately; do not rely on overrun flexibility. Changing the job scope/body policy requires a reviewed follow-up. Paid Workers is an alternative only after reviewing those measurements and user approval; no model API dependency is needed.

R2 backup after the migrations restored into fresh in-memory SQLite with exact cell comparison in all 29 learning/operation tables, including skill_states, ai_jobs and private context snapshots. Staging unauthenticated APIs return 401; another QA learner cannot read the lesson/subject; non-admin cannot read admin jobs; unsigned automation is denied. At 375px the loaded room has document width 375px (no horizontal overflow); the existing unfinished/finished learner state was preserved.

Final staging code deployment: `f64cc4d2-ce38-452d-96de-6b3c2a6db96a`. Real unhuman Deutsch completion observed in D1 (13/10 10:32 UTC); this was not created by QA scripts and does not alone satisfy the three-lesson acceptance gate.

## H2.5–H6 review fixes, H5.9 budget work and H6 — 13/10/2026

- Branch `hub2/h2-h5-hardening` on top of PR #91 (`4b6b207`). Independent review of #90/#91 found no access hole; fixed: nightly chain could skip daily jobs, nightly refresh overwrote AI review dates and resolved patterns, replayed submission lost its graded state, saved submission/notebook reported as failed at the job cap, retry after the solution counted as E2, orphaned leases, distractor error labels visible before grading, photo-only error quotes building patterns, AI budget keys ignored, dry runs counted as strikes, later alerts not emailed, superseded grades not restorable. New code reformatted for review.
- Migration 0014: `skill_states.review_source`, `subjects.system_kind` (one "Khám phá" per learner), indexes on attempts/grades/disputes. Rehearsed on a fresh staging export: 35 tables, row counts identical, `foreign_key_check` and `integrity_check` clean. Export kept private (scratchpad), not in Git.
- Local budget measurement (`scripts/benchmark-cpu-local.mjs`, synthetic Deutsch notebook, 14 days, 15 KB lesson): lease+context 2–3 ms / 18 queries, context 32 KB; dry run 1–2 ms / 22; apply 2–4 ms / 28; submit 4 items 2–3 ms / 30; nightly refresh 1 ms / 13. Node CPU includes SQLite, so it is an upper bound for Worker CPU. Not yet confirmed with Wrangler tail on staging.
- H6 local acceptance in the browser (child + parent test accounts, local only): dispute with recheck shows "Đang chấm lại"; dispute without recheck → "Nhờ phụ huynh xem" → parent sets a grade in Sổ liên lạc; "Hỏi thêm" request shows "Đang chờ soạn"; quality table shows 2 disputes, 1 overturned, 1 key issue; admin "Chấm sai cần xem" empty after resolution; 375 px without horizontal overflow.
- 222 tests, typecheck, lint, contracts and build pass.
- Staging: 0014 applied; Worker version `f996b84e-69fd-4879-ad88-948d4f5271f4`, `APP_VERSION=hub2-h6-2026-10-13`, cron `0 1-5 * * *`. Anonymous and forged `oai-authenticated-user-*` probes of the new request, dispute and quality routes return 401. Production unchanged.

## Direct MCP staging — 13/10/2026

- Dedicated Worker `learning-hub-mcp-staging`, version `6d0cfd3f-80b7-4744-868e-b90329d85654`. Endpoint `/mcp`; no production/DNS/Sites deployment. Main Hub config unchanged.
- Additive migration 0015 applied to staging after private SQL export and SQLite drill: exact cells in 35 pre-existing tables unchanged, foreign keys pass.
- HTTPS E2E PASS: missing bearer 401/discovery, DCR, signed login continuation, consent, PKCE/resource token, MCP initialize and 7 tools, own learner context, check/save/readback of a synthetic lesson, refresh, revocation denying an already issued JWT (403).
- QA job `job_643649b681ee633cde7d` saved lesson `les_901112ec4d516bacf21c`; QA fixtures subsequently removed, QA identities blocked and their grants/tokens revoked. No real content generation claimed.
- Real learner preservation after cleanup PASS: 8 lessons, 7 subjects, 3 skills, 18 lesson items, 5 submissions, 10 attempts, 8 grades; exact cell digests match pre-migration export for these seven learning tables.
- 237/237 tests pass; typecheck, lint, schema check and main Vinext build pass. No secrets displayed or committed. Existing auth/automation v1 schema behavior retained via `zod/v3` compatibility after OAuth peer dependency upgrade.
- Public oversized registration body is rejected (413); spoofed Sites identity headers cannot authenticate MCP (401). Bodies are bounded while streaming, including requests without Content-Length.
- Remaining acceptance: actual ChatGPT account connects via OAuth, sees/calls write tools, creates a real Deutsch lesson and verifies its ID in Hub; scheduled cloud task availability and a real scheduled run. This does not satisfy production H4/H5 gates or all Free CPU limits.
- Operations and setup: [DIRECT-MCP](ops/DIRECT-MCP.md).

## H7–H8 staging — 14/10/2026

- Fixed workload budget: only unfinished v2 lessons in active notebooks count, consistently in context and atomic writer guard; legacy reference lessons and paused notebooks do not block Deutsch. Older unfinished primary remains visible; reasons distinguish same-day assignment from completion after cutoff. Completion remains a manual action independent of grades.
- Extra lessons contribute to the atomic budget and receipts now include extraLessonIds, including system exploration notebooks.
- Real app MCP E2E: `job_1e37662741dbfc79dfc1` succeeded; lesson `les_6e79984e6d82480cc66a` saved/read back. The main lesson and saved answers retained. Content authored for unhuman, Goethe A2 description opened with recorded read scope; no audio/source access invented. Subscription token telemetry unavailable; usage zeros documented as placeholders, not measured counts.
- Cardio removal: one subject/one legacy lesson for unhuman removed in each environment after private SQL backup + SQLite FK/preservation drill. Other users untouched. Fresh production migration drill 0009–0015 preserves exact cells of 4 remaining lessons; remote production migrations were not applied.
- Queue probe: first public same-zone fetch failed; service-binding HTTP probe passed after 130026 ms. Probe workers/queue subsequently cleaned. No paid plan activated.
- Assessor staging deployed disabled, dedicated machine credentials scoped to one adult pilot, existing AUTOMATION_CLIENTS unchanged. Access + bearer schema connection verified 200 from the assessor Worker itself. Public connection-check requires credential; model key absent, no paid inference. Uses global_fetch_strictly_public and manual redirects so credentials are never forwarded to redirected hosts.
- R2 format4 backup `h8-drill-2026-10-14-655a5c3c`: upload/download SHA-256 match; downloaded backup restored with exact rows in 29 learning tables on fresh SQLite. Authentication/JWKS remain separate private SQL backup with matching auth secret.
- 256 tests, typecheck, lint, contract checks and build pass. Chemistry display preserves raw submission values and letter case; formula keys require case-sensitive grading in chemistry notebooks. 25 synthetic eval cases/5 injection cases/5 original math images prepared; expected grades require human review and no model quality acceptance claimed.
- Pending gates: API key/account spend limit, live assessment/latency/quality eval, ChatGPT task registration and real 3-night receipts, user learning and feedback, school curriculum, production cutover. H8 code/preparation is not completion of week-based acceptance.

Final staging versions for this release: Hub `5bfdf691-b2e8-4936-967e-d3ede55d9940`, MCP `26e0d462-325b-4790-bc28-4594fb766df2`, assessor `4a4e927f-31e2-4691-aeb6-8c475e3d562f`. Final HTTPS smoke: login/register/reset assets load, unauthenticated home redirects, forged identity rejected across 16 API checks. Restored real Deutsch lesson renders through current reader with 5 items. Curriculum is stored in the D1 subject for cloud MCP access, not just a local file.

## Quyết định 14/10/2026: chỉ dùng thuê bao

Luồng API Anthropic/OpenAI bị loại khỏi code/dependencies/workflow; chấm chuyển sang direct MCP với scope riêng hub:assess. Cần cấp lại OAuth và nghiệm thu bài nộp thật. Không cam kết chấm tức thì hoặc task cloud khi chưa kiểm thật. Toán 7/KHTN 7 theo Kết nối tri thức từ 2026–2027; chưa bật AI cho trẻ. Production không đổi.

### Chuyển sang grading bằng thuê bao — 14/10/2026

- 249/249 test đạt; typecheck, lint, contracts:check và build đạt. Test MCP synthetic đi qua context/check/save/read gradeIds, giữ completion; job có ảnh không bị claim. Token hub:plan không được tự nâng quyền khi consent mở rộng.
- Deploy riêng MCP staging: `981086fb-ad2d-463a-a216-c5467cbde72b`. Discovery 200, scopes openid/offline_access/hub:plan/hub:assess; MCP anonymous 401. App ChatGPT thật gọi hub2_schema đọc được assess-context/1 và assess-result/1.
- Đã gỡ consumer assessor khỏi learning-hub-ai-staging, xóa Worker learning-hub-assessor-staging và secret ASSESSOR_CLIENT staging. Queue, D1, jobs và lịch sử giữ nguyên; AUTOMATION_CLIENTS không bị thay. Không deploy code production, không đổi DNS.
- Đã nghiệm thu luồng thủ công: OAuth hub:assess được cấp; ngày 14/10 app ChatGPT mới xử lý 4 lượt nộp trên staging. Codex đọc lại từng job qua MCP: 4/4 succeeded, mỗi lượt có một gradeId đúng receipt người dùng báo. Không ghi lại bài làm hay grade IDs vào tài liệu/Git.
- Người dùng báo check → lưu một lần → đọc lại và lần lease cuối jobs: []; Codex chỉ xác minh receipts, không lease mới để kiểm hàng đợi. Điểm auto của i3 được giữ theo receipts; không gửi lại kết quả hay tự hoàn thành bài.
- Đây là nghiệm thu kỹ thuật bằng lượt nộp có nội dung thử, chưa nghiệm thu chất lượng sư phạm hoặc năng lực Deutsch. Còn task cloud gọi được app, 3 đêm, bộ chuẩn được duyệt, bài học/feedback thật và pilot dài hạn. Không báo H7/H8 hoàn tất; production không đổi.

### MCP Events staging — 14/10/2026

- 257 test đạt; typecheck/lint/contracts/build đạt. Native SDK MCP2 server/discover và events/list có resultType complete; legacy tools giữ nguyên factory/auth. Test challenge mismatch/private DNS/unauthorized/revoke/410 và receipt không làm thay job.
- Snapshot SQL staging mới lưu riêng tư quyền0600. Migration0016 trên bản sao giữ nguyên toàn bộ cell của 43 bảng cũ, foreign_key_check đạt; sau đó áp riêng staging.
- MCP Worker staging version `97709ece-8df0-44d7-bb11-4599f21a12f0`, Events enabled với cron mỗi phút. Worker Hub chính/DNS/production không đổi.
- Callback chỉ hai origin provider cố định; public DNS và no redirect. Chưa có socket DNS pinning; không cho arbitrary callback. Nếu callback thật khác allowlist thì fail closed, cần kiểm chứng origin trước thêm.
- iCloud là tài khoản ChatGPT Work Cloud theo xác nhận người dùng, không phải thay account Hub/unhuman. Không đưa email ChatGPT vào source/config hay chuyển dữ liệu.
- Chưa nghiệm thu: ChatGPT events/subscribe và callback thật, event webhook2xx, WorkCloud run và saved outcome. Không tạo subscription giả, không coi cron deployed là tự động đã hoạt động. Lỗi export10000 lần đầu; quyền migrations đọc được, backup thử lại đã thành công trước remote migration.

### Events discovery follow-up — 14/10/2026

Work screenshot reports no event registration capability, while manual MCP processed a plan. Staging readback0subscriptions/0deliveries; no automatic subscription or delivery accepted. Rescan/plugin event catalog is the next check; cause remains unconfirmed. Fixed unsubscribe to documented event-name/arguments/callback identity, idempotent and owner-scoped;258tests/typecheck/lint/contracts/build pass. MCP staging version33ec1f40-9c66-44cd-a21f-b05a10a3b3c1. No remote migration, production, learner answers or job result writes in this follow-up.

### Events catalog có, phiên thử local — 14/10/2026

Ảnh mới xác nhận Events được khám phá. Metadata và lịch sử chat “Theo dõi lượt Deutsch mới” khớp nội dung người dùng gửi, xác nhận Codex/local và cwd Learning Hub. Vì vậy lần thử này chưa chạy Work Cloud; thiếu cơ chế tạo subscription trong phiên đó, không còn là lỗi catalog cần rescan. Chỉ kiểm tra đọc; không gửi prompt sang chat khác, tạo polling, thay bài hoặc đổi production. Cần đăng ký bằng actual WorkCloud rồi xác minh callback/outcome.

### Automations creation failure diagnostics — 14/10/2026

ChatGPT chat “Theo dõi Learning Hub” reports two automation-create failures and no saved automation; catalog has correct event/filter. Readback D1 has no subscriptions/deliveries. Chat retrieval does not expose raw automation error, so cause is not assigned to OpenAI or callback/auth. Added fixed-category diagnostic logs without callback credentials or answers.259tests/typecheck/lint/contracts/build pass; MCP staging version957a8bae-eab6-4239-9411-5fae8287376a. No new automation, subscription, polling task, learning write, migration or production change. Need raw UI error or a controlled single plan subscription attempt to correlate logs.

### TTL protocol compatibility — 14/10/2026

User-provided expansion still contains final summaries, not raw Automation failure. Corrected subscribe lifetime validation: accept finite positive requested ttlMs, then grant at most seven days; no longer reject30-day requests before handler.260tests/typecheck/lint/contracts/build pass; staging MCP version89936c01-9f6d-40b5-9376-4ba345eea72f. This independently fixes a compatibility gap, not a proven cause of actual create failure. No automation retry, subscription created, migration or production change. Next controlled test: only kind plan, return actual task/subscription ID or tool error.
## L1.1 Qwen on the family Mac — 10/11/2026

MacBook Pro M4 Pro, 48 GB. LM Studio, model `qwen/qwen3.6-35b-a3b` (MLX, vision-capable), context 32k, TTL 15 min.

- Load: 19.6 s, 27.1 GiB resident.
- `scripts/eval-assess.mjs` on `fixtures/eval/assess/deutsch.json` (4 submissions × 4 open answers, authored; draft key not yet confirmed by the owner): mean 20.9 s per submission (~2.6k prompt tokens → ~1k output tokens), valid `assess-result/1` JSON 4/4 on the first try, result agreement 14/16, G/P/N agreement 9/10, 0 correct answers marked wrong without evidence, injection attempts 0/2 shifted, all evidence quotes verbatim.
- With a JSON schema, LM Studio returns the reply in `reasoning_content` while the model thinks; the engine reads either field.
- Not yet measured: photos (vision), 96 KB contexts, Codex engine. Gate E1 needs the 30-case set graded by the owner.
- Codex engine (`gpt-6.1-sol`, ChatGPT plan; the local Codex default `gpt-5.4` is refused for ChatGPT accounts): `--output-schema` with the full assess schema produced no reply after 8 minutes, while the same prompt without it answered in 32 s. The engine now puts the schema in the prompt; the zod contracts and one repair round catch drift. Same eval: mean 31.5 s per submission, 4/4 valid JSON, 15/16 agreement, G/P/N 8/9, 1 of 2 injection cases graded differently from the draft key (reviewed below in Gate E1 with the owner's key).
- Local end-to-end (10/11/2026, `wrangler dev` with `HOUSEHOLD_GATE=access`, local bypass): "Ai đang học?" → profile Ếch → submitted an open answer → lesson showed "Máy chấm đang tắt" → `home-runner --once` leased the job, LM Studio loaded Qwen on demand, graded in 11 s, Hub verified → feedback showed the hint only, with "Xem lời giải" and "Chấm sai?". The first run was rejected by the Hub: Qwen invented `patternId`s and once graded one answer twice. The runner now nulls unknown pattern ids and keeps one grade per answer (ids only, never a judgement), and after all engines fail it lets the Hub requeue (max three leases). Qwen also flagged a correct sentence (*Am Sonntag möchte ich ins Kino gehen.*) as wrong: a grading-quality case for the Gate E1 set.

## Staging, local-runner release — 10/11/2026

- Migrations 0015–0016 rehearsed on a fresh staging export (row counts unchanged: user 15, subjects 6, ai_jobs 37, learner_settings 4, attempts 20, grades 18; foreign keys and integrity clean), then applied to staging D1.
- Branch `hub2/l-local-runner` deployed to staging: version `525400e7-325c-4b84-b44e-ce1542ea6417`. No `HOUSEHOLD_GATE` yet, so staging keeps accounts.
- Not verified from this Mac: Cisco Umbrella on the current network re-signs `*.workers.dev`, so HTTPS checks fail here (`learn.unhuman.cc` is fine). Staging smoke tests and the runner need another network or the `learn-staging.unhuman.cc` custom domain (docs/ops/local-grader-setup.md B1).
- Pending the owner: `AUTOMATION_CLIENTS` secret upload, custom domain, Access apps, PR #95 merge (these writes were refused by the session's permission policy).
- Eval extended to 32 authored cases (draft key). Qwen: 8/8 valid JSON, mean 23.9 s per submission, agreement 24–26/32 across runs, G/P/N 11/19, 1/4 injection cases graded off the key, 1 non-verbatim evidence quote. Below the Gate E1 bar (≥90%); typical misses are partial→incorrect and a missing comma before *weil* graded correct.

## Knowledge Maintainer · K0

Tài liệu ChatGPT xác nhận Scheduled Tasks dùng được các app được hỗ trợ và thao tác ghi có thể yêu cầu duyệt. Tài liệu chưa xác nhận khả năng chạy nền với custom MCP Learning Hub. Connector hiện thấy trong Codex chỉ có công cụ soạn và chấm. Chưa thử OAuth mới, lượt ghi nền, web search trong cùng lượt, refresh token hoặc giờ chạy Berlin trên staging. [Scheduled tasks in ChatGPT](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)
