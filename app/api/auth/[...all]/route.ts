import { getHubAuth } from "../../../../lib/auth/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return getHubAuth().handler(request);
}

export async function POST(request: Request) {
  return getHubAuth().handler(request);
}
