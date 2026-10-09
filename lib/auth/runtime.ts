import { env } from "cloudflare:workers";
import { createHubAuth, type HubAuthBindings } from "./create";

const instances = new WeakMap<D1Database, ReturnType<typeof createHubAuth>>();

export function getHubAuth() {
  const bindings = env as unknown as HubAuthBindings;
  if (!bindings.DB) throw new Error("Database unavailable");
  let auth = instances.get(bindings.DB);
  if (!auth) {
    auth = createHubAuth(bindings);
    instances.set(bindings.DB, auth);
  }
  return auth;
}
