import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { deleteStudent, updateStudent } from "../../../../lib/server/student-wrong-book";
import type { Student } from "../../../../lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = await request.json() as { student?: Partial<Student> };
    return Response.json({ student: await updateStudent(id, body.student ?? {}, user) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "学生档案更新失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json({ ok: true, ...await deleteStudent(id, user) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "学生档案删除失败" }, { status: 500 });
  }
}
