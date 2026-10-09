import { redirect } from "next/navigation";
import Home from "./home-client";
import { getHubUser } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getHubUser();
  if (!user) redirect("/login");
  return <Home userEmail={user.email} userRole={user.role ?? "learner"} />;
}
