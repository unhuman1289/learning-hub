# Learning Hub authentication email

## Selected path

Keep Workers Free and deliver verification and password-reset messages through Resend's email API. The code fails closed: account creation is disabled outside local development until both `RESEND_API_KEY` and `EMAIL_FROM` are present. It never falls back to an unverified sender or exposes the provider's response body to learners.

The provider's current free plan is listed as 3,000 emails/month, up to 100/day, and 3 sending domains; confirm current limits in the [Resend pricing page](https://resend.com/pricing) before enabling it.

## Staging configuration

The owner verified `notify.unhuman.cc` in Resend and configured the staging Worker. `EMAIL_FROM` is `Learning Hub <no-reply@notify.unhuman.cc>`; `APP_ORIGIN` is `https://learning-hub-staging.tranvu-812.workers.dev`. The four secret names are present in staging. Their values are never printed or stored in Git.

End-to-end email delivery has not yet been confirmed from the deployed signup/reset flows. Complete that check using the invited mailbox after staging registration is open. Do not paste the API key or passwords into chat.

For a fresh environment, add Worker secrets to **staging** with Wrangler's interactive prompts so values do not enter shell history:

   ```sh
   npx wrangler secret put BETTER_AUTH_SECRET --env staging
   npx wrangler secret put RESEND_API_KEY --env staging
   npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL --env staging
   npx wrangler secret put ALLOWED_SIGNUP_EMAILS --env staging
   ```

   `BETTER_AUTH_SECRET` must be a random value of at least 32 characters. `BOOTSTRAP_ADMIN_EMAIL` and the comma-separated `ALLOWED_SIGNUP_EMAILS` are account configuration, not source code; treat them as secrets because they contain personal addresses. Add the initial owner to the allowlist and bootstrap variable. After its first successful verified signup, remove the bootstrap variable. Add invited learners to the allowlist before asking them to register.
5. Set non-secret staging variables `ENVIRONMENT=staging`, `APP_ORIGIN=https://learning-hub-staging.tranvu-812.workers.dev`, and the verified `EMAIL_FROM` in `wrangler.jsonc`.
6. Verify sign-up, delivered verification link, login, sign-out, reset link, expired/used token handling, and rate limits on staging before production cutover.

## Account behavior in this checkout

- Registration is invite-only. Emails are normalized to lowercase; passwords are 12–128 characters.
- New remote accounts remain `pending` until the verification link is used, then become `active`. Only active users get an application session.
- The first invited address matching `BOOTSTRAP_ADMIN_EMAIL` receives `admin` only while no admin exists. `/api/export` is admin-only. There is no user-management page yet; updating invitations is an operator task until the planned admin API/UI work.
- Local loopback development uses only `local@example.test`; it skips mail verification locally. `.dev.vars` is ignored by Git and must never be reused for deployment.
- Progress and daily lesson answers are still in the existing shared workspace at this phase. Per-user progress isolation is the planned P1.1 migration; authentication does not imply that work is complete.

Production sender configuration is not set up by this staging change. Do not copy staging auth secrets into production until the owner explicitly authorizes production work.
