import type { LibraryScope, Question } from "../../../../lib/types";
import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { deleteScopedQuestion, updateScopedQuestion } from "../../../../lib/server/library";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = await request.json() as { question?: Question; scope?: LibraryScope };
    if (!body.question?.stem?.trim() || !body.question.categoryId) return Response.json({ error: "请填写题干并选择分类" }, { status: 400 });
    const question = await updateScopedQuestion(id, body.question, user, body.scope === "public" ? "public" : "mine");
    return Response.json({ question });
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
    const scope: LibraryScope = new URL(request.url).searchParams.get("scope") === "public" ? "public" : "mine";
    await deleteScopedQuestion(id, user, scope);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "试题删除失败" }, { status: 500 });
  }
}
