import { clientAddress, requireSameOrigin } from "../../../../lib/server/auth";
import { loginStudent } from "../../../../lib/server/homework-auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json() as { teacherCode?: string; loginId?: string; password?: string };
    const result = await loginStudent(body.teacherCode ?? "", body.loginId ?? "", body.password ?? "", clientAddress(request), new URL(request.url).protocol === "https:");
    return Response.json({ student: result.student }, { headers: { "Set-Cookie": result.cookie } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "学生登录失败" }, { status: 500 });
  }
}
