import { requireSameOrigin, requireUser } from "../../../lib/server/auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireUser(request);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "下载授权失败" }, { status: 500 });
  }
}
