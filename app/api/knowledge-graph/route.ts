import { requireUser } from "../../../lib/server/auth";
import { readTeacherKnowledgeGraph } from "../../../lib/server/homework-capabilities";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const studentId = new URL(request.url).searchParams.get("studentId") ?? "";
    return Response.json(
      { profile: await readTeacherKnowledgeGraph(user, studentId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "知识图谱读取失败" }, { status: 500 });
  }
}
