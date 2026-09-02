import { requireSameOrigin, requireUser } from "../../../../../lib/server/auth";
import { readStudentAccount, setStudentAccount } from "../../../../../lib/server/homework-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request); const { id } = await context.params;
    return Response.json({ account: await readStudentAccount(id, user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "学生账号读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params;
    const body = await request.json() as { loginId?: string; password?: string };
    return Response.json({ account: await setStudentAccount(id, body.loginId ?? "", body.password ?? "", user) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "学生账号设置失败" }, { status: 500 });
  }
}
