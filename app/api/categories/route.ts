import type { Category } from "../../../lib/types";
import { requireSameOrigin, requireUser } from "../../../lib/server/auth";
import { libraryBindings } from "../../../lib/server/library";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as { category?: Category };
    const name = body.category?.name?.trim().slice(0, 100);
    if (!name) return Response.json({ error: "请填写分类名称" }, { status: 400 });
    const category: Category = { id: body.category?.id || crypto.randomUUID(), name, parentId: body.category?.parentId || null, createdAt: Date.now(), createdBy: user.id };
    await libraryBindings().DB.prepare("INSERT INTO categories (id, name, parent_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)")
      .bind(category.id, category.name, category.parentId, category.createdAt, user.id).run();
    return Response.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "分类创建失败" }, { status: 500 });
  }
}
