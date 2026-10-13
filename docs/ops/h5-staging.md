# H4–H5: staging and QA

This release adds evidence-derived skills, review/error states, today's queue and leased plan/assess jobs. D1 owns all persisted learning state. The deterministic fake runner tests transport and database behavior; it is not a teacher or a real AI connection. Production acceptance is still gated on unhuman learning three real lessons.

Use Node 22.13+ (CI Node 24). In this checkout:

```sh
npm run db:migrate:local
npm run test
npm run typecheck
npm run lint
npm run contracts:check
npm run build
```

`prepare-h5-qa.mjs` writes generated QA passwords, service credentials and seed SQL to a private folder, mode 0600. For staging, supply `--staging --bridge-secrets <private bridge JSON>`. It preserves the v1 clients in that configuration and adds a v2 client restricted to the generated learner ID. Review the existing configuration before uploading `secrets.json` with Wrangler; never commit or paste its contents.

Run `e2e-hub2.mjs --manifest <private QA manifest>` after separately seeding that folder's `seed.sql` and `job.sql` into the matching environment. Only localhost and the exact staging hostname are permitted. It exercises the authenticated app and leased service API; no learner data is sent to a model.

`benchmark-h5-staging.mjs --manifest <private staging manifest> --prepare` creates stress-test SQL for the synthetic QA account only. Run it in staging, then use `--run`. Monitor actual Worker CPU via Wrangler tail or Cloudflare metrics; HTTP latency and local execution time are not CPU measurements. Do not repeat failed writes before reading back the database/job state.

API v2 is under `/api/automation/v2`: schema, jobs/lease, jobs/:id, context, result (`?dryRun=1`), heartbeat, fail and scoped attachment reads. Access JWT plus bearer scopes/purposes/triggers and a lease token protect writers; local JWT bypass also needs bearer and applies only to localhost with local environment. Snapshot hashes, revision guards and result hashes make concurrent writes/replays safe. Recheck decisions and exploration assignments are H6, currently rejected.

After verification use `staging-reset-hub2.mjs --execute-staging --manifest <private QA manifest>`. Only generated QA IDs match; their learning data is removed and identities blocked for audit. Never use it with real accounts. Remove the temporary QA client afterward by uploading the preserved original client configuration. The private SQL export remains the recovery source; Git is not a database backup.

03:00 Europe/Berlin cron queues eligible daily jobs and refreshes evidence/reviews; 06:00 checks missing nightly results. Queue has a producer only in H5. Actual consumer/runner and ChatGPT cloud-task capability evaluation belong to H7. Jobs remain queued until a permitted runner takes them. No model API key is required by this release.
