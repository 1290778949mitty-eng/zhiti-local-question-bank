import { requireSameOrigin, requireUser } from "../../../lib/server/auth";
import { createClass, readClasses } from "../../../lib/server/homework";

export async function GET(request: Request) {
  try { return Response.json({ classes: await readClasses(await requireUser(request)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "班级读取失败" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { requireSameOrigin(request); const user = await requireUser(request); const body = await request.json() as { name?: string; studentIds?: string[] };
    return Response.json({ class: await createClass(body.name ?? "", body.studentIds ?? [], user) }, { status: 201 }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "班级创建失败" }, { status: 500 }); }
}
