import { getHubUser } from "../../../../lib/auth/session";
import { storage } from "../../../../db/storage";
import { approvePendingAccount, listPendingApprovals } from "../../../../lib/auth/approval-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function requireAdmin() {
  const user = await getHubUser();
  if (!user) return { response: Response.json({ error: "Sign in required" }, { status: 401, headers }) };
  if (user.role !== "admin") return { response: Response.json({ error: "Admin access required" }, { status: 403, headers }) };
  return { user };
}

export async function GET() {
  const access = await requireAdmin();
  if ("response" in access) return access.response;

  try {
    return Response.json({ users: await listPendingApprovals(storage()) }, { headers });
  } catch {
    return Response.json({ error: "Không tải được danh sách tài khoản chờ duyệt." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const access = await requireAdmin();
  if ("response" in access) return access.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Origin rejected" }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ." }, { status: 400, headers });
  }
  const userId = body && typeof body === "object" && "userId" in body
    ? (body as { userId?: unknown }).userId
    : undefined;
  if (typeof userId !== "string" || !userId.trim() || userId.length > 128) {
    return Response.json({ error: "Tài khoản không hợp lệ." }, { status: 400, headers });
  }

  try {
    if (!await approvePendingAccount(storage(), userId)) {
      return Response.json({ error: "Tài khoản không còn ở trạng thái chờ duyệt hoặc chưa xác minh email." }, { status: 409, headers });
    }
    return Response.json({ approved: true }, { headers });
  } catch {
    return Response.json({ error: "Chưa duyệt được tài khoản. Hãy tải lại danh sách rồi thử lại." }, { status: 503, headers });
  }
}
