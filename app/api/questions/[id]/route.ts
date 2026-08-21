import type { Question } from "../../../../lib/types";
import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { canEdit, libraryBindings, prepareQuestion } from "../../../../lib/server/library";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const existing = await libraryBindings().DB.prepare("SELECT questions.created_by, questions.created_at, users.email AS created_by_email FROM questions LEFT JOIN users ON users.id = questions.created_by WHERE questions.id = ?").bind(id).first<{ created_by: string | null; created_at: number; created_by_email: string | null }>();
    if (!existing) return Response.json({ error: "试题不存在" }, { status: 404 });
    if (!canEdit(user, existing.created_by)) return Response.json({ error: "你只能修改自己录入的题目" }, { status: 403 });
    const body = await request.json() as { question?: Question };
    if (!body.question?.stem?.trim() || !body.question.categoryId) return Response.json({ error: "请填写题干并选择分类" }, { status: 400 });
    const question = await prepareQuestion({ ...body.question, id }, user, { createdBy: existing.created_by, createdAt: existing.created_at });
    await libraryBindings().DB.prepare("UPDATE questions SET category_id = ?, payload_json = ?, updated_at = ? WHERE id = ?")
      .bind(question.categoryId, JSON.stringify(question), question.updatedAt, id).run();
    return Response.json({ question: { ...question, createdBy: existing.created_by, createdByEmail: existing.created_by_email, canEdit: true } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "试题更新失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const existing = await libraryBindings().DB.prepare("SELECT created_by FROM questions WHERE id = ?").bind(id).first<{ created_by: string | null }>();
    if (!existing) return Response.json({ error: "试题不存在" }, { status: 404 });
    if (!canEdit(user, existing.created_by)) return Response.json({ error: "你只能删除自己录入的题目" }, { status: 403 });
    await libraryBindings().DB.prepare("DELETE FROM questions WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "试题删除失败" }, { status: 500 });
  }
}
