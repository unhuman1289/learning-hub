# Automation credential setup and rotation

The Worker accepts only SHA-256 hashes of the Learning Hub bearer secret. The service-token secret stays at the runner and is never copied into `AUTOMATION_CLIENTS`.

## Credential shape

`AUTOMATION_CLIENTS` is a Cloudflare Worker secret containing JSON like this. The sample hash and IDs are placeholders:

```json
[
  {
    "id": "test-runner-v1",
    "keySha256": "<64 lowercase hex characters>",
    "scopes": ["runs:create", "context:read", "result:write"],
    "accessClientId": "<Cloudflare Access service-token ID>"
  }
]
```

Generate the random bearer secret in a password manager. Calculate only its hash locally, without putting the secret in shell history, then enter the resulting JSON at Wrangler's hidden prompt. Never paste either value into chat. `AUTOMATION_ACCESS_AUD` is the non-secret audience tag for the Access application and belongs in the environment variables; `AUTOMATION_CLIENTS` belongs in Worker secrets.

## Rotation with overlap

1. Create a new Cloudflare Access service token and a new random Learning Hub bearer secret.
2. Add a second client entry with a new ID (for example `test-runner-v2`) and its new bearer hash and Access service-token ID. Keep the existing entry temporarily so the old runner can still finish an in-flight run.
3. Update the runner's two credentials and perform one test run against staging.
4. Remove the old client entry and rotate the Worker secret. Confirm the old bearer + service token now return `401`, while the new pair still works.
5. Revoke the old Cloudflare Access service token. Store only the new values in the password manager/runner secret store.

Cloudflare Worker secrets replace the previous value, so prepare the complete JSON array before running `wrangler secret put AUTOMATION_CLIENTS --env staging`. The prompt hides the secret; do not use `--value`, command-line literals, shell tracing, or checked-in files.

This rotation procedure is documentation only until the Access application, audience, Worker secret, migration, and staging deployment have been configured and verified.
