# Cloudflare foundation checklist

Updated 9 October 2026 after the staging MVP deployment. This records observed state; production/DNS remain outside this change.

## P0.0 — account and decisions

| Item | Observed state | Next step |
| --- | --- | --- |
| Cloudflare account and zone | Signed in; `unhuman.cc` is Active, registrar Cloudflare, Free plan; DNS Setup shows Full | Ready |
| `learn.unhuman.cc` DNS | CNAME to `custom-domains.chatgpt.site`, DNS only. `quest.unhuman.cc` uses a proxied Tunnel. | Preserve both. Do not proxy or move Learning Hub until the P1 cutover. |
| Zero Trust | Free plan activated at $0/month, 0 of 50 seats used. Team domain is now `unhuman-lab.cloudflareaccess.com`. The requested `unhuman.cloudflareaccess.com` was already claimed by another account. | Do not use for learner sign-in. Configure Service Auth for the automation route in P0.5 after standalone auth. |
| R2 | Subscription active at $0/month base. Dedicated staging bucket `learning-hub-backups-staging` created in WEUR; Worker binding is private. | Actual first R2 object and restore drill still need an admin session or the next 03:00 Berlin cron. |
| Learner sign-in | On 08/10/2026, owner chose Learning Hub accounts with email + password; Google and Access OTP are not desired for learners. Owner email was supplied for the initial invite; keep personal emails out of Git. | P0.4 implementation is in the local checkout. Configure app secrets and a verified transactional sender before staging signup; see [EMAIL.md](EMAIL.md). |
| Google IdP | Not configured; no longer needed for learner sign-in. | No action. |
| Access applications | None exist. The Access dashboard is empty. | Per the updated plan, create only App B Service Auth for `learn-staging.unhuman.cc/api/automation/*` in P0.5. Do not attach human Access login to `learn.unhuman.cc`. |
| GitHub Cloudflare secrets | Both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` exist in private repository `unhuman1289/learning-hub`. | Token `learning-hub-github-deploy` expires 2027-10-08. Its permissions are Workers Scripts Write, D1 Write and Workers R2 Storage Write at account scope, plus Workers Routes Write scoped to `unhuman.cc`. Token value is stored only as the GitHub secret. |

The staging Worker and staging/production D1 databases are created. Zero Trust Free and R2 were activated after the account owner accepted overage terms; the account payment method may be charged if usage exceeds the included allowances. No Access application was created, and no DNS record was changed.

## P0.1 — Sites snapshot

A private, mode-0600, restore-capable snapshot is stored locally at `private-data/sites-export-2026-10-09.json`, with method and verification notes in `private-data/sites-export-2026-10-09-provenance.txt`. Neither file belongs in Git.

It records Site v5 source commit `ed5cdc0a2b7e86b899f0810690a4de4033908d47`, 5 lessons, 2 runs, 5 slots, and 1 workspace. The current Site D1 rows were read through the owner-only Sites database tools and combined with the previous complete export. All slot/workspace cells match live reads; lesson IDs, non-payload fields, saved answers, completion state, timestamps, and available normalized payload prefixes match. The read tool truncates long lesson payloads, so unreturned suffixes were retained from the previous full export. This is a verified reconstruction, **not a byte-for-byte native export**.

The snapshot was restored into isolated local D1 at `.wrangler/state-snapshot-2026-10-09`; every saved snapshot cell matched on read-back. The user-supplied legacy JSON remains unverified and was not used. Keep the previous full export until a native, untruncated Site export can replace this reconstruction.

## P0.2 — Worker and D1 configuration

- Staging D1: `learning-hub-staging` (`6f2f1df1-1dcd-4810-8812-1c6e4d7ef1d5`), location `weur`.
- Production D1: `learning-hub-prod` (`545cedea-a4a5-4bdb-b370-8d447fe0833c`), location `weur`; database exists but has no migrations or learner data.
- `wrangler.jsonc` contains the real IDs for both environments, staging `APP_ORIGIN`/`EMAIL_FROM`, the private R2 binding, and the UTC cron pair filtered in code to 03:00 Europe/Berlin. `STAGING_SPIKE_LOCKDOWN=false` only in staging after the auth checks passed.

## P0.3 — staging spike

- Worker: `learning-hub-staging`, https://learning-hub-staging.tranvu-812.workers.dev
- Current Worker version: `947a4c0f-d458-4a8b-a65d-234063c33cee`, deployed 9 October 2026 after the MVP source deploy. Earlier secret-only version `0dc528f3-b055-4787-bc13-31d3ef637d82` is superseded.
- Confirmed by `wrangler secret list --env staging` (names/types only; values not read): `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, and `ALLOWED_SIGNUP_EMAILS` are present as `secret_text`.
- Staging variables are set to `APP_ORIGIN=https://learning-hub-staging.tranvu-812.workers.dev` and `EMAIL_FROM=Learning Hub <no-reply@notify.unhuman.cc>`; values are non-secret configuration. Worker bindings show D1 `learning-hub-staging` and R2 `learning-hub-backups-staging`.
- Migrations `0000`–`0003` are applied. Before migration, the seven existing D1 tables were confirmed empty. The private Sites snapshot was imported with insert-only SQL. Remote readback matched every imported cell: 5 lessons, 5 slots, 1 workspace, 2 runs. The source Sites data was not modified.
- Open-mode staging smoke passed: health/D1 200, anonymous `/` redirects to `/login`, account pages 200, `/api/state`, `/api/daily`, `/api/export`, and `/api/admin/backup` return 401 without a session even with forged Sites identity headers; `/api/learning-run` returns 410 for GET and POST.
- An isolated local Worker + throwaway D1 test also passed invite-only signup (uninvited address 403), session login/logout, D1 progress write/read after a fresh login, and old-session rejection. Staging inbox verification/reset and the real R2 object/restore are still waiting on the owner account action or the scheduled backup.
- The prior 48-hour/CPU p95 gate is removed by the 09/10 decision. CPU p95 is unmeasured and remains an observation after deploy, not a launch blocker.

`learn.unhuman.cc` continues to point to Sites v5; no production Worker deploy, custom domain, route, or DNS cutover has been made. Staging currently has a manual backup button for admin and scheduled backup at 03:00 Europe/Berlin. The first real R2 backup is not yet recorded.
