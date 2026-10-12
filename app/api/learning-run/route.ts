const headers = { "Cache-Control": "no-store" };

function gone() {
  return Response.json(
    { error: "This endpoint is not available on standalone Workers." },
    { status: 410, headers },
  );
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}
