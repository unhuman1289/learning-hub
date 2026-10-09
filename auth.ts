// Schema-generation config only. Runtime requests use lib/auth/runtime.ts and
// bind the actual Cloudflare D1 database and secrets per Worker environment.
import { betterAuth } from "better-auth";
import { authSchemaOptions } from "./lib/auth/schema-options";

export const auth = betterAuth({
  ...authSchemaOptions,
  secret: "schema-generation-only-not-for-runtime",
});
