import { requireSameOrigin, requireUser } from "../../../../../lib/server/auth";
import { readWrongQuestions, recordWrongQuestions } from "../../../../../lib/server/student-wrong-book";
import type { LibraryScope } from "../../../../../lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json({ entries: await readWrongQuestions(id, user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "错题记录读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = await request.json() as { scope?: LibraryScope; questionIds?: string[]; note?: string };
    const scope: LibraryScope = body.scope === "mine" ? "mine" : "public";
    if (!Array.isArray(body.questionIds)) return Response.json({ error: "请选择要记录的题目" }, { status: 400 });
    return Response.json(await recordWrongQuestions(id, scope, body.questionIds, body.note ?? "", user), { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "错题记录失败" }, { status: 500 });
  }
}
