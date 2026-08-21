import type { Question } from "../../../lib/types";
import { requireSameOrigin, requireUser } from "../../../lib/server/auth";
import { libraryBindings, prepareQuestion } from "../../../lib/server/library";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as { question?: Question };
    if (!body.question?.stem?.trim() || !body.question.categoryId) return Response.json({ error: "请填写题干并选择分类" }, { status: 400 });
    const category = await libraryBindings().DB.prepare("SELECT id FROM categories WHERE id = ?").bind(body.question.categoryId).first();
    if (!category) return Response.json({ error: "所选分类不存在" }, { status: 400 });
    const question = await prepareQuestion(body.question, user);
    await libraryBindings().DB.prepare("INSERT INTO questions (id, category_id, payload_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(question.id, question.categoryId, JSON.stringify(question), user.id, question.createdAt, question.updatedAt).run();
    return Response.json({ question: { ...question, createdBy: user.id, createdByEmail: user.email, canEdit: true } }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "试题保存失败" }, { status: 500 });
  }
}
