# Cloudflare Access for automation

This is an operator checklist for the separate automation identity. Learning Hub users keep signing in with their own email and password; do not put an Access login wall in front of `learn.unhuman.cc`.

## Application to configure

Create one Cloudflare Access self-hosted application for the staging hostname and the path `/api/automation/*`, with a **Service Auth** policy restricted to the dedicated automation service token. Do not add an `Allow Everyone` policy. Do not protect `/login`, account pages, or the rest of the site with this application.

When staging is ready, record the application's audience tag in the non-secret `AUTOMATION_ACCESS_AUD` Worker variable. Keep the team issuer as `https://unhuman-lab.cloudflareaccess.com`. Save the generated service-token ID as the matching `accessClientId` in `AUTOMATION_CLIENTS`; the token secret must never go in that JSON.

Cloudflare Access must inject the signed `Cf-Access-Jwt-Assertion` header. The Worker independently verifies its signature, exact issuer, audience, `type=app`, an empty `sub`, and matching `common_name` (a present `service_token_status` must be true). The route also requires a separate scoped bearer credential.

## Verification before enabling a runner

- No Access token: `401 unauthenticated`.
- Access assertion without a valid Learning Hub bearer key: `401 unauthenticated`.
- Browser session without automation credentials: `403 insufficient_scope`.
- Missing endpoint scope: `403 insufficient_scope`.
- Service token with the wrong application audience or client ID: `401 unauthenticated`.
- Direct `workers.dev` request with no valid pair: denied too; workers.dev is not an auth bypass.
- Automation credentials on a learner endpoint: denied; only the app session can reach learner data.

Do not record service-token values or bearer secrets in this document, Git, command history, or chat.
