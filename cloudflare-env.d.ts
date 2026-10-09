declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_VERSION?: string;
    ENVIRONMENT?: string;
    STAGING_SPIKE_LOCKDOWN?: string;
  }
}
