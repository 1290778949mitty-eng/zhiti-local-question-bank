import { requireUser } from "../../../../../lib/server/auth";
import { readTeacherCapabilityProfile } from "../../../../../lib/server/homework-capabilities";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request); const { id } = await context.params; const assignmentId = new URL(request.url).searchParams.get("assignmentId") ?? "";
    return Response.json({ profile: await readTeacherCapabilityProfile(id, user, assignmentId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "能力图谱读取失败" }, { status: 500 });
  }
}
