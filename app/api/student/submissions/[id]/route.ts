import { requireSameOrigin } from "../../../../../lib/server/auth";
import { requireStudent } from "../../../../../lib/server/homework-auth";
import { readStudentSubmission, updateSubmission } from "../../../../../lib/server/homework";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const student = await requireStudent(request); const { id } = await context.params; return Response.json({ submission: await readStudentSubmission(id, student) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "提交记录读取失败" }, { status: 500 }); }
}
export async function PUT(request: Request, context: Context) {
  try { requireSameOrigin(request); const student = await requireStudent(request); const { id } = await context.params; const body = await request.json() as { action?: string; pages?: Array<{ originalAssetId: string; processedAssetId: string; quality?: unknown }> };
    return Response.json({ submission: await updateSubmission(id, body, student) }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "提交记录更新失败" }, { status: 500 }); }
}
