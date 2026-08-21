import type { LibraryData } from "../../../../lib/types";
import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { libraryBindings, prepareQuestion } from "../../../../lib/server/library";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const data = await request.json() as LibraryData;
    if (!Array.isArray(data.categories) || !Array.isArray(data.questions)) return Response.json({ error: "备份格式不正确" }, { status: 400 });
    if (data.questions.length > 1000 || data.categories.length > 500) return Response.json({ error: "单次最多导入 1000 道题和 500 个分类" }, { status: 413 });
    const db = libraryBindings().DB;
    const categoryIds = new Map<string, string>();
    for (const category of data.categories) {
      const id = crypto.randomUUID();
      categoryIds.set(category.id, id);
      await db.prepare("INSERT INTO categories (id, name, parent_id, created_at, created_by) VALUES (?, ?, NULL, ?, ?)")
        .bind(id, String(category.name || "未命名分类").slice(0, 100), Date.now(), user.id).run();
    }
    for (const category of data.categories) {
      if (!category.parentId) continue;
      const id = categoryIds.get(category.id); const parentId = categoryIds.get(category.parentId);
      if (id && parentId) await db.prepare("UPDATE categories SET parent_id = ? WHERE id = ?").bind(parentId, id).run();
    }
    let imported = 0;
    for (const raw of data.questions) {
      const categoryId = categoryIds.get(raw.categoryId);
      if (!categoryId || !raw.stem?.trim()) continue;
      const question = await prepareQuestion({ ...raw, id: crypto.randomUUID(), categoryId }, user);
      await db.prepare("INSERT INTO questions (id, category_id, payload_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(question.id, categoryId, JSON.stringify(question), user.id, question.createdAt, question.updatedAt).run();
      imported += 1;
    }
    return Response.json({ imported });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "备份导入失败" }, { status: 500 });
  }
}
