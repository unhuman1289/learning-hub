# Deployment and migration status

## Local export is ready; independent hosting is a separate step

This repository retains the Sites/Vinext runtime. `.openai/hosting.json` identifies the existing Site; `wrangler.local.json` is for LOCAL D1 operations only, with a placeholder database ID. Do not deploy this configuration as production.

The public URL still points to the existing managed Sites deployment. No domain, live database, schedule or access policy was changed during the export.

## What must change before deploying to your Cloudflare account

1. Create a real D1 database in your account; keep its actual ID in the production configuration and apply tracked migrations.
2. Implement independent browser authentication. Sites currently supplies validated `oai-authenticated-user-*` headers. A standalone Worker cannot trust those headers from clients.
3. Give the automated content writer separate authenticated permissions; GET context and POST proposals must both be protected. The exported learning-run route relies on Sites' outer access boundary.
4. Port any Sites service/connector dependencies. A Drive plugin connection in ChatGPT is not automatically an OAuth credential for the deployed website.
5. Import the private snapshot and compare all row counts, current IDs, responses and revisions. Freeze writes briefly or take a new snapshot at cutover; this export becomes stale as learning continues.
6. Configure the cloud task's Hub tools and Docs permissions. Test a full run, including unchanged unfinished work and laptop-off execution.
7. Deploy/test on a separate staging hostname, measure CPU and D1 use, then change `learn.unhuman.cc` to the new deployment. Preserve access restrictions. Reconcile/disable the old schedule only after replacement works.

Use Workers Free first. The current server-rendered app has not yet been benchmarked against its CPU limit; a lightweight static frontend/API split can reduce CPU if needed. Upgrade based on measurements, not because “AI is slow”: waiting for network services does not count as CPU execution.

## Git workflow

The GitHub repository is private. Different coding accounts can edit the same authorized repo through their own connections/clones; they need GitHub access, not Sites Editor access. Use feature branches, checks and merge; deploy only verified commits. Adding collaborators is separate from creating the repo and has not been done by this export.

## Backups

The initial snapshot is `private-data/sites-export.json` and is ignored by Git. Keep an encrypted/private external backup. Git history backs up code and migrations, not ongoing D1 data. The local restore command targets LOCAL D1 only and never writes to production.

## References

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- D1 export: https://developers.cloudflare.com/d1/best-practices/import-export-data/
