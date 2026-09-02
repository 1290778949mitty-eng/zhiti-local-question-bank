import { requireSameOrigin, requireUser } from "../../../lib/server/auth";
import { createAssignment, readAssignments } from "../../../lib/server/homework";
import type { Assignment } from "../../../lib/types";
export async function GET(request: Request) {
  try { return Response.json({ assignments: await readAssignments(await requireUser(request)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "作业读取失败" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { requireSameOrigin(request); const user = await requireUser(request); const body = await request.json() as { assignment?: Partial<Assignment> };
    return Response.json({ assignment: await createAssignment(body.assignment ?? {}, user) }, { status: 201 }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "作业创建失败" }, { status: 500 }); }
}
