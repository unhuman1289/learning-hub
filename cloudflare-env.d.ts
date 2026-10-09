declare namespace Cloudflare {
  interface Env {
    ASSETS?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_ORIGIN?: string;
    APP_VERSION?: string;
    ENVIRONMENT?: string;
    STAGING_SPIKE_LOCKDOWN?: string;
    BETTER_AUTH_SECRET?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  }
}
