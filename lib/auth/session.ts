import { headers } from "next/headers";
import { env } from "cloudflare:workers";
import { getHubAuth } from "./runtime";
import { storage } from "../../db/storage";
import { householdMode, manageActive, profileFromCookie } from "../household";

export type HubUser = { id: string; name: string; email: string; role: string | null | undefined; status: string | null | undefined; profileMode?: boolean };

/**
 * The person using the app. With a household gate (docs/plan/LOCAL-GRADER.md L5) this is the profile chosen on this
 * device; "Chế độ quản lý" gives it admin powers. Without one it is the signed-in Better Auth account.
 */
export async function getHubUser(): Promise<HubUser | null> {
  if (householdMode(env)) return getProfileUser();
  const session = await getHubAuth().api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user || user.status !== "active") return null;
  return user;
}

async function getProfileUser(): Promise<HubUser | null> {
  const cookieHeader = (await headers()).get("cookie");
  const id = await profileFromCookie(cookieHeader, env.PROFILE_COOKIE_SECRET);
  if (!id) return null;
  const row = await storage()
    .prepare("SELECT u.id,u.name,u.email,s.display_name FROM user u LEFT JOIN learner_settings s ON s.user_id=u.id WHERE u.id=? AND u.status='active'")
    .bind(id)
    .first<{ id: string; name: string; email: string; display_name: string | null }>();
  if (!row) return null;
  const manage = await manageActive(cookieHeader, env.PROFILE_COOKIE_SECRET);
  return { id: row.id, name: row.display_name ?? row.name, email: row.email, role: manage ? "admin" : "learner", status: "active", profileMode: true };
}
