import {env} from "cloudflare:workers";
import { redirect } from "next/navigation";
import Home from "./home-client";
import { getHubUser } from "../lib/auth/session";
import { householdMode } from "../lib/household";
import { ProfilePicker } from "../components/profile-controls";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profiles = !!householdMode(env);
  const user = await getHubUser();
  if (!user) {
    if (profiles) return <ProfilePicker />;
    redirect("/login");
  }
  return <Home hub2Enabled={env.HUB2_ENABLED==="true"} userEmail={profiles ? "" : user.email} userName={user.name ?? ""} userRole={user.role ?? "learner"} profileMode={profiles} profileAvatar={user.avatar ?? ""} />;
}
