import { requireSameOrigin, requireUser } from "../../../../../lib/server/auth";
import { deleteAssignmentAsset, reorderAssignmentAssets } from "../../../../../lib/server/homework-assets";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params;
    const body = await request.json() as { role?: "question" | "answer"; assetIds?: string[] };
    if (!body.role || !["question", "answer"].includes(body.role)) return Response.json({ error: "页面类型无效" }, { status: 400 });
    await reorderAssignmentAssets(id, body.role, body.assetIds ?? [], user);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "模板页面排序失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params;
    const body = await request.json() as { assetId?: string };
    await deleteAssignmentAsset(id, String(body.assetId ?? ""), user);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "模板页面删除失败" }, { status: 500 });
  }
}
