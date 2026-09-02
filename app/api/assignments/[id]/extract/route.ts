import { requireSameOrigin, requireUser } from "../../../../../lib/server/auth";
import { extractAssignmentTemplate } from "../../../../../lib/server/homework";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try { requireSameOrigin(request); const user = await requireUser(request); const { id } = await context.params; return Response.json({ assignment: await extractAssignmentTemplate(id, user) }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "模板识别失败" }, { status: 500 }); }
}
