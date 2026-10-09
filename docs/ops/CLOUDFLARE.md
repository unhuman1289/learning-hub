# Cloudflare staging record

Updated 9 October 2026. Staging resources are isolated from the live Learning Hub domain.

## Staging Worker and D1

- Worker: `learning-hub-staging`
- Preview URL: https://learning-hub-staging.tranvu-812.workers.dev
- D1: `learning-hub-staging` (`6f2f1df1-1dcd-4810-8812-1c6e4d7ef1d5`), region `weur`
- Migrations applied: `0000_lovely_roughhouse.sql`, `0001_equal_madame_web.sql`, `0002_wealthy_gambit.sql`
- Worker version at the last successful smoke run: `58544ed6-18e6-4915-91d1-cbed718b3db3` (9 October 2026, 00:04:33 UTC)
- The staging D1 currently contains schema only. The Sites snapshot has not been imported; import/remote cell verification remain P0.7.

The `workers.dev` hostname is public, so `STAGING_SPIKE_LOCKDOWN=true` blocks the app and all asset bundles. The root serves a neutral infrastructure probe; `/api/health` performs `SELECT 1` against D1. Other APIs return 404, and `/api/learning-run` returns 410. Do not remove the lock or expose the app until standalone authentication and API authorization are complete.

The successful smoke run checked 20 probe-page requests, 20 D1 health requests, `/api/learning-run` (410), `/api/state` (404), and the client manifest (404). The measured network response p95 was 44.2 ms for the probe page and 244.6 ms for health. These are HTTP round-trip timings, **not Worker CPU measurements**. Wrangler reported a 38 ms startup time, also not CPU p95.

The 48-hour runtime soak started at 9 October 2026, 00:04 UTC. It is due for review at 11 October 2026, 00:04 UTC, provided there is no later Worker deploy. A runtime update restarts the observation window. CPU p95 is still unmeasured; the current deployment credential is for deployment and D1 operations and does not provide Analytics Read access. D2 is therefore not decided. Do not use these probe timings to claim the Vinext CPU target passed.

## Production isolation

- Production D1: `learning-hub-prod` (`545cedea-a4a5-4bdb-b370-8d447fe0833c`), created in `weur`; no migrations have been applied and no application data has been copied.
- No production Worker deployment, custom domain, route, or DNS cutover has been made.
- `learn.unhuman.cc` continues to point to the existing Sites v5. Its DNS record was not changed.
- During an earlier routing check, the public preview briefly served the prerendered Hub page before the static-asset guard was corrected. The latest smoke verifies the neutral page and a 404 for the client bundle. Access logs were not reviewed, so access during that short interval cannot be determined. No learner state or Site snapshot was imported into either D1.

## Sites snapshot P0.1

A private, mode-0600, restore-capable snapshot is stored locally at `private-data/sites-export-2026-10-09.json`, with the method and verification notes in `private-data/sites-export-2026-10-09-provenance.txt`. Neither file belongs in Git.

It records Site v5 source commit `ed5cdc0a2b7e86b899f0810690a4de4033908d47`, 5 lessons, 2 runs, 5 slots, and 1 workspace. The current Site D1 rows were read through the owner-only Sites database tools and combined with the previous complete export. All slot and workspace cells match live reads; lesson IDs, non-payload fields, saved answers, completion state, timestamps, and the available normalized payload prefixes match. The read tool truncates long lesson payloads, so their unreturned suffixes were retained from the previous full export. This is a verified reconstruction, **not a byte-for-byte native export**.

The snapshot was restored into an isolated local D1 database and every saved snapshot cell matched on read-back. The user-supplied legacy JSON remains unverified and was not used. Keep the previous full export until a native, untruncated Site export can replace this reconstruction.
