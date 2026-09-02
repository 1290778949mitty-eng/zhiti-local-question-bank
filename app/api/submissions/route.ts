import { requireSameOrigin, requireUser } from "../../../lib/server/auth";
import { createSubmission, readTeacherSubmissions } from "../../../lib/server/homework";
export async function GET(request: Request) {
  try { const user = await requireUser(request); const assignmentId = new URL(request.url).searchParams.get("assignmentId") ?? "";
    return Response.json({ submissions: await readTeacherSubmissions(assignmentId, user) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "提交记录读取失败" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { requireSameOrigin(request); const user = await requireUser(request); const body = await request.json() as { assignmentId?: string; studentId?: string };
    return Response.json({ submission: await createSubmission({ assignmentId: body.assignmentId ?? "", studentId: body.studentId }, user) }, { status: 201 }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "提交记录创建失败" }, { status: 500 }); }
}
