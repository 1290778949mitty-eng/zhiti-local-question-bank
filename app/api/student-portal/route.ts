import { requireUser } from "../../../lib/server/auth";
import { ensureTeacherPortal } from "../../../lib/server/homework-auth";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const portal = await ensureTeacherPortal(user);
    let origin = new URL(request.headers.get("Referer") || request.headers.get("Origin") || request.url).origin;
    const configuredOrigin = process.env.STUDENT_PORTAL_ORIGIN?.trim();
    if (configuredOrigin) {
      const candidate = new URL(configuredOrigin);
      if (!/^https?:$/.test(candidate.protocol)) throw new Error("学生入口地址仅支持 HTTP 或 HTTPS");
      origin = candidate.origin;
    }
    return Response.json({ ...portal, url: `${origin}/student/${portal.code}` }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "学生入口读取失败" }, { status: 500 });
  }
}
