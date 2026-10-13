# Automation API v1

This is the standalone Worker contract for content-preparation runners. It is provider-neutral: a runner can use ChatGPT, Claude, or deterministic test data. It does not configure or invoke an AI model. A non-AI reference runner and end-to-end acceptance are separate Phase 1 tasks.

## Current deployment status

Verified 2026-10-13: the Learning Hub plugin schema responds through the Sites bridge pinned to staging, using Automation API v1. Staging has migrations through `0011_evidence.sql`; manual v1 bridge acceptance is recorded in `docs/VALIDATION.md`. This does not prove a scheduled cloud task or a production bridge. The bridge starts manual runs and cannot accept `lesson-package/2`. For adult Deutsch content preparation and the reviewed v2 admin import path, see `docs/automation/DEUTSCH-PILOT.md`. H5/H7 v2 context, writer and cloud runner remain planned; this v1 contract is retained for compatibility.

## Authentication

Every `/api/automation/v1/*` request needs both:

1. A Cloudflare Access service-token assertion for the exact Service Auth application audience and client ID.
2. `Authorization: Bearer lhk_<clientId>_<randomSecret>`, where Worker secret `AUTOMATION_CLIENTS` stores only the SHA-256 hash of the random secret and the allowed scopes.

The route checks the signature, issuer, audience, service-token claims, client ID, bearer hash and scope. Browser sessions cannot call automation endpoints; their cookie does not grant service access. Automation credentials do not grant access to learner `/api/daily` endpoints.

## Endpoints

| Method | Path | Scope |
| --- | --- | --- |
| `POST` | `/api/automation/v1/runs` | `runs:create` |
| `GET` | `/api/automation/v1/runs/{runId}/context` | `context:read` |
| `POST` | `/api/automation/v1/runs/{runId}/result` | `result:write` |
| `POST` | `/api/automation/v1/runs/{runId}/fail` | `result:write` |
| `GET` | `/api/automation/v1/runs/{runId}` | `context:read` |
| `GET` | `/api/automation/v1/schema` | `context:read` |

Starting a run is a write. Use `Idempotency-Key` when a scheduled caller may retry. The same client/key and payload returns the original run; reusing the key with different input returns `409`. The first context read snapshots active learner targets and returns the same context on later reads. The result is accepted once. Same-payload replay returns the saved outcome; different results return `409`. Runs expire two hours after creation.

Result assignments are checked again inside the D1 write batch. A changed lesson, unfinished lesson, lesson completed after the Berlin 03:00 cutoff, duplicate assignment for a learner/track/day, or expired run cannot replace existing work. Previous lessons and saved answers remain in history. At most ten lessons can be assigned per run.

The context omits account names and emails, includes only short track history and completed answers not previously processed, and enforces a 64 KB limit. Lesson text is treated as untrusted data, never as an instruction. Obvious contact details are redacted; text that looks like identifiable clinical case material is withheld. Track goals currently return `null`; P1.6 will move goals into D1 before the runner is enabled. This is a safeguard, not a guarantee: never put identifiable patient information into Learning Hub answers.

## Example

```json
{
  "contractVersion": "1",
  "trigger": "scheduled",
  "runner": { "name": "test-runner", "version": "0.1.0", "model": "none" }
}
```

The result payload schema and lesson package are available from the authenticated schema endpoint. `result.contextHash` must be copied from the exact context returned for that run. After a timeout or uncertain response, `GET /runs/{runId}` before deciding whether to retry.

The shared daily update does not run on the Worker yet. The Cloudflare cron currently backs up D1 only; do not confuse backup success with generated lesson updates.
