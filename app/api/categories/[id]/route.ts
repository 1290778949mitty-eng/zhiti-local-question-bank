import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { libraryBindings } from "../../../../lib/server/library";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    if (user.role !== "admin") return Response.json({ error: "只有管理员可以删除分类" }, { status: 403 });
    const { id } = await context.params;
    const db = libraryBindings().DB;
    const descendants = await db.prepare(`WITH RECURSIVE tree(id) AS (
      SELECT id FROM categories WHERE id = ?
      UNION ALL SELECT categories.id FROM categories JOIN tree ON categories.parent_id = tree.id
    ) SELECT id FROM tree`).bind(id).all<{ id: string }>();
    const ids = descendants.results.map((row: { id: string }) => row.id);
    if (!ids.length) return Response.json({ error: "分类不存在" }, { status: 404 });
    const placeholders = ids.map(() => "?").join(",");
    await db.batch([
      db.prepare(`DELETE FROM questions WHERE category_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM categories WHERE id IN (${placeholders})`).bind(...ids),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "分类删除失败" }, { status: 500 });
  }
}
