import { headers } from "next/headers";
import { getHubAuth } from "./runtime";

export async function getHubUser() {
  const session = await getHubAuth().api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user || user.status !== "active") return null;
  return user;
}
