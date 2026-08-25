import type { LibraryScope, Question } from "../../../lib/types";
import { requireSameOrigin, requireUser } from "../../../lib/server/auth";
import { createScopedQuestion } from "../../../lib/server/library";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as { question?: Question; scope?: LibraryScope };
    if (!body.question?.stem?.trim() || !body.question.categoryId) return Response.json({ error: "请填写题干并选择分类" }, { status: 400 });
    const question = await createScopedQuestion(body.question, user, body.scope === "public" ? "public" : "mine");
    return Response.json({ question }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "试题保存失败" }, { status: 500 });
  }
}
