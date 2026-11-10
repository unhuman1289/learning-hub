import {env} from "cloudflare:workers";
import { redirect } from "next/navigation";
import Home from "./home-client";
import { getHubUser } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getHubUser();
  if (!user) redirect("/login");
  return <Home hub2Enabled={env.HUB2_ENABLED==="true"} userEmail={user.email} userName={user.name ?? ""} userRole={user.role ?? "learner"} />;
}
