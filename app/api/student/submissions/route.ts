import { requireSameOrigin } from "../../../../lib/server/auth";
import { requireStudent } from "../../../../lib/server/homework-auth";
import { createSubmission, readStudentSubmissions } from "../../../../lib/server/homework";
export async function GET(request: Request) {
  try { return Response.json({ submissions: await readStudentSubmissions(await requireStudent(request)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "提交记录读取失败" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { requireSameOrigin(request); const student = await requireStudent(request); const body = await request.json() as { assignmentId?: string };
    return Response.json({ submission: await createSubmission({ assignmentId: body.assignmentId ?? "" }, student) }, { status: 201 }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "提交记录创建失败" }, { status: 500 }); }
}
