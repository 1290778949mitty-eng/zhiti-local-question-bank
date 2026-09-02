import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { deleteClass, updateClass } from "../../../../lib/server/homework";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try { requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params; const body = await request.json() as { name?: string; studentIds?: string[] };
    return Response.json({ class: await updateClass(id, body.name ?? "", body.studentIds ?? [], user) }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "班级更新失败" }, { status: 500 }); }
}
export async function DELETE(request: Request, context: Context) {
  try { requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params; await deleteClass(id, user); return Response.json({ ok: true }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "班级删除失败" }, { status: 500 }); }
}
