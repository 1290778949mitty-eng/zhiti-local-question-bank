import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { deleteAssignment, readAssignment, updateAssignment } from "../../../../lib/server/homework";
import type { Assignment } from "../../../../lib/types";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const user = await requireUser(request); const { id } = await context.params; return Response.json({ assignment: await readAssignment(id, user) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "作业读取失败" }, { status: 500 }); }
}
export async function PUT(request: Request, context: Context) {
  try { requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params; const body = await request.json() as { assignment?: Partial<Assignment> & { action?: string } };
    return Response.json({ assignment: await updateAssignment(id, body.assignment ?? {}, user) }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "作业更新失败" }, { status: 500 }); }
}
export async function DELETE(request: Request, context: Context) {
  try { requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params; await deleteAssignment(id, user); return Response.json({ ok: true }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "作业删除失败" }, { status: 500 }); }
}
