import { requireStudent } from "../../../../lib/server/homework-auth";
import { studentWrongBook } from "../../../../lib/server/homework";
export async function GET(request: Request) {
  try { return Response.json({ entries: await studentWrongBook(await requireStudent(request)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: error instanceof Error ? error.message : "错题本读取失败" }, { status: 500 }); }
}
