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
