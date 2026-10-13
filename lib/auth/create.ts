import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import {mcpScopes} from "../mcp/metadata";
import {isChatGptCallback} from "../mcp/policy";
import { authSchemaOptions } from "./schema-options";
import { initialAccountStatus, statusAfterEmailVerification } from "./approval-policy";
import { accountCanCreateSession } from "./approval-store";
import { escapeHtml, sendAuthEmail } from "./email";

export type HubAuthBindings = {
  DB: D1Database;
  MCP_ENABLED?: string;
  HUB2_ENABLED?: string;
  APP_ORIGIN?: string;
  ENVIRONMENT?: string;
  BETTER_AUTH_SECRET?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function resolveOrigin(bindings: HubAuthBindings): string | undefined {
  const configured = bindings.APP_ORIGIN?.trim();
  const isLocal = bindings.ENVIRONMENT === "local";
  if (!configured && isLocal) return undefined;
  if (!configured) throw new Error("APP_ORIGIN is required outside local development.");

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("APP_ORIGIN must be a valid absolute URL.");
  }
  if (
    (url.protocol !== "https:" && !(isLocal && url.hostname === "localhost")) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_ORIGIN must be an HTTPS origin (HTTP is allowed only on localhost).");
  }
  return url.origin;
}

async function signupRole(
  bindings: HubAuthBindings,
  email: string,
): Promise<"admin" | "learner"> {
  const normalized = normalizeEmail(email);
  const bootstrapEmail = normalizeEmail(bindings.BOOTSTRAP_ADMIN_EMAIL ?? "");
  if (bootstrapEmail && bootstrapEmail === normalized) {
    const admin = await bindings.DB.prepare(
      'SELECT 1 AS present FROM "user" WHERE role = ? LIMIT 1',
    )
      .bind("admin")
      .first<{ present: number }>();
    if (!admin) return "admin";
  }

  return "learner";
}

function htmlLink(url: string, label: string): string {
  return `<p><a href="${escapeHtml(url)}">${label}</a></p>`;
}

export function createHubAuth(bindings: HubAuthBindings) {
  const isLocal = bindings.ENVIRONMENT === "local";
  const appOrigin = resolveOrigin(bindings);
  const localBaseURL = {
    allowedHosts: ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "[::1]", "[::1]:*"],
    protocol: "http" as const,
  };
  const secret = bindings.BETTER_AUTH_SECRET?.trim();
  const authSecret = secret || (isLocal ? "local-only-learning-hub-auth-secret-32-chars" : "");
  if (authSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }

  const emailDeliveryConfigured = Boolean(
    bindings.RESEND_API_KEY?.trim() && bindings.EMAIL_FROM?.trim(),
  );

  return betterAuth({
    appName: "Learning Hub",
    plugins: bindings.MCP_ENABLED === "true" && bindings.HUB2_ENABLED === "true" && appOrigin ? [jwt(), mcp({
      resource: appOrigin + "/mcp", loginPage: "/login", consentPage: "/connect/chatgpt",
      scopes: mcpScopes,
      allowDynamicClientRegistration: true, allowUnauthenticatedClientRegistration: true,
      accessTokenExpiresIn: 900, refreshTokenExpiresIn: 30 * 86400,
      codeExpiresIn: 120, grantTypes: ["authorization_code", "refresh_token"],
      // Exact registered callback plus HTTPS; no wildcard or user-supplied audience.
      validateRedirectUri: async (uri, _registered, matched) => matched && isChatGptCallback(uri),
    })] : [],
    ...authSchemaOptions,
    database: bindings.DB,
    secret: authSecret,
    baseURL: appOrigin ?? (isLocal ? localBaseURL : undefined),
    basePath: "/api/auth",
    trustedOrigins: appOrigin
      ? [appOrigin]
      : async (request) => (request ? [new URL(request.url).origin] : []),
    advanced: {
      useSecureCookies: !isLocal,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: {
      ...authSchemaOptions.rateLimit,
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        "/oauth2/register": {window: 60, max: 4},
        "/oauth2/token": {window: 60, max: 20},
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 4 },
        "/request-password-reset": { window: 60, max: 4 },
        "/send-verification-email": { window: 60, max: 4 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = normalizeEmail(user.email);
            const role = await signupRole(bindings, email);
            return { data: { ...user, email, role, status: initialAccountStatus(isLocal) } };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (!await accountCanCreateSession(bindings.DB, session.userId)) return false;
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: isLocal,
      disableSignUp: !emailDeliveryConfigured && !isLocal,
      requireEmailVerification: !isLocal,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(bindings, {
          to: user.email,
          subject: "Đặt lại mật khẩu Learning Hub",
          text: `Mở liên kết này để đặt lại mật khẩu: ${url}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
          html: `<p>Mở liên kết này để đặt lại mật khẩu Learning Hub:</p>${htmlLink(url, "Đặt lại mật khẩu")}<p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: !isLocal,
      sendOnSignIn: !isLocal,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(bindings, {
          to: user.email,
          subject: "Xác minh email Learning Hub",
          text: `Mở liên kết này để xác minh email: ${url}\n\nLiên kết hết hạn sau một giờ.`,
          html: `<p>Mở liên kết này để xác minh email Learning Hub:</p>${htmlLink(url, "Xác minh email")}<p>Liên kết hết hạn sau một giờ.</p>`,
        });
      },
      afterEmailVerification: async (user) => {
        const account = await bindings.DB.prepare('SELECT role FROM "user" WHERE id = ?')
          .bind(user.id)
          .first<{ role: string | null }>();
        await bindings.DB.prepare('UPDATE "user" SET status = ? WHERE id = ? AND status = ?')
          .bind(statusAfterEmailVerification(account?.role ?? "learner", isLocal), user.id, "pending")
          .run();
      },
    },
  });
}
