import { requireSameOrigin } from "../../../../lib/server/auth";
import { logoutStudent } from "../../../../lib/server/homework-auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await logoutStudent(request) } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "退出失败" }, { status: 500 });
  }
}
