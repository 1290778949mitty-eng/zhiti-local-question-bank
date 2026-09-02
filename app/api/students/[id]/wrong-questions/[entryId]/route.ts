import { requireSameOrigin, requireUser } from "../../../../../../lib/server/auth";
import { deleteWrongQuestion, updateWrongQuestion } from "../../../../../../lib/server/student-wrong-book";
import type { WrongQuestionEntry } from "../../../../../../lib/types";

type RouteContext = { params: Promise<{ id: string; entryId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id, entryId } = await context.params;
    const body = await request.json() as { entry?: Partial<WrongQuestionEntry> };
    await updateWrongQuestion(id, entryId, body.entry ?? {}, user);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "错题记录更新失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id, entryId } = await context.params;
    await deleteWrongQuestion(id, entryId, user);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "错题记录删除失败" }, { status: 500 });
  }
}
