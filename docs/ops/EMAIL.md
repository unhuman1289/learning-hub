# Learning Hub authentication email

## Selected path

Keep Workers Free and deliver verification and password-reset messages through Resend's email API. The code fails closed: account creation is disabled outside local development until both `RESEND_API_KEY` and `EMAIL_FROM` are present. It never falls back to an unverified sender or exposes the provider's response body to learners.

The provider's current free plan is listed as 3,000 emails/month, up to 100/day, and 3 sending domains; confirm current limits in the [Resend pricing page](https://resend.com/pricing) before enabling it.

## Staging configuration

The owner verified `notify.unhuman.cc` in Resend and configured the staging Worker. `EMAIL_FROM` is `Learning Hub <no-reply@notify.unhuman.cc>`; `APP_ORIGIN` is `https://learning-hub-staging.tranvu-812.workers.dev`. Auth and mail secret values are never printed or stored in Git.

The owner has confirmed receiving a staging password-reset email and successfully signing in. Do not paste the API key, verification/reset links, or passwords into chat.

For a fresh environment, add Worker secrets to **staging** with Wrangler's interactive prompts so values do not enter shell history:

   ```sh
   npx wrangler secret put BETTER_AUTH_SECRET --env staging
   npx wrangler secret put RESEND_API_KEY --env staging
   npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL --env staging
   ```

   `BETTER_AUTH_SECRET` must be a random value of at least 32 characters. `BOOTSTRAP_ADMIN_EMAIL` is only used to give the first verified account admin access while no admin exists. Public signup no longer uses an allowlist; obsolete `ALLOWED_SIGNUP_EMAILS` was removed from staging and is not read by the app.
5. Set non-secret staging variables `ENVIRONMENT=staging`, `APP_ORIGIN=https://learning-hub-staging.tranvu-812.workers.dev`, and the verified `EMAIL_FROM` in `wrangler.jsonc`.
6. Verify sign-up, delivered verification link, login, sign-out, reset link, expired/used token handling, and rate limits on staging before production cutover.

## Account behavior in this checkout

- Anyone can register. Email verification is required; public accounts remain `pending` after verification until an admin approves them. The session writer and all protected APIs reject pending or disabled accounts. Passwords are 12–128 characters.
- Admins see verified pending accounts on the **Hôm nay** dashboard and can approve them there. Approval only changes a verified `learner` from `pending` to `active`; the API checks the admin session, exact request origin, and database state.
- The first verified address matching `BOOTSTRAP_ADMIN_EMAIL` receives `admin` only while no admin exists. `/api/export` and account approval are admin-only.
- Local loopback development accepts signups without sending mail and activates them immediately. `local@example.test` is the configured one-time bootstrap admin address in the local Wrangler vars. `.dev.vars` is ignored by Git and must never be reused for deployment.
- Progress and daily lesson answers are still in the existing shared workspace at this phase. Per-user progress isolation is the planned P1.1 migration; authentication does not imply that work is complete.

Production sender configuration is not set up by this staging change. Do not copy staging auth secrets into production until the owner explicitly authorizes production work.
