import { env } from "cloudflare:workers";
import { createHubAuth, type HubAuthBindings } from "./create";

export function getHubAuth() {
  const bindings = env as unknown as HubAuthBindings;
  if (!bindings.DB) throw new Error("Database unavailable");
  // Better Auth initializes its context asynchronously. Workers ties that
  // promise to the current request, even when D1 bindings are reused.
  return createHubAuth(bindings);
}
