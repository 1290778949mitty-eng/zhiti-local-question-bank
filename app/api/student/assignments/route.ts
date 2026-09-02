import { requireStudent } from "../../../../lib/server/homework-auth";
import { readStudentAssignments } from "../../../../lib/server/homework";
export async function GET(request: Request) {
  try { return Response.json({ assignments: await readStudentAssignments(await requireStudent(request)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "作业读取失败" }, { status: 500 }); }
}
