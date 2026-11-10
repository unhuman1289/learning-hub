declare namespace Cloudflare {
  interface Env {
    APP_ENV?:string;
    AI_JOBS_DAILY_CAP?:string;
    AI_DISPATCH_URL?:string;
    AI_DISPATCH_SECRET?:string;
    AI_COST_ALERT_USD?:string;
    AI_PRICE_TABLE?:string;
    AI_QUEUE?:Queue;
    EVENT_DISPATCHER?:{dispatch(jobId:string):Promise<{delivered:number}>};
    ASSETS?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** Learners' photos of handwritten work; objects expire after 30 days (bucket lifecycle). */
    UPLOADS?: R2Bucket;
    APP_ORIGIN?: string;
    APP_VERSION?: string;
    DEPLOYMENT_ID?: string;
    ENVIRONMENT?: string;
    STAGING_SPIKE_LOCKDOWN?: string;
    HUB2_ENABLED?:string;
    MCP_ENABLED?:string;
    MCP_EVENTS_ENABLED?:string;
    BETTER_AUTH_SECRET?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    HOUSEHOLD_GATE?: string;
    APP_ACCESS_AUD?: string;
    PROFILE_COOKIE_SECRET?: string;
    HOUSEHOLD_PASSPHRASE_SHA256?: string;
    HOUSEHOLD_LEGACY_PROFILE_IDS?: string;
    ACCESS_TEAM_DOMAIN?: string;
    AUTOMATION_ACCESS_AUD?: string;
    AUTOMATION_CLIENTS?: string;
    ASSESSOR_CLIENT?: string;
  }
}
