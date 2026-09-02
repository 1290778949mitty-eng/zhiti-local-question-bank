import { requireStudent } from "../../../../lib/server/homework-auth";
import { readStudentCapabilityProfile } from "../../../../lib/server/homework-capabilities";

export async function GET(request: Request) {
  try {
    const student = await requireStudent(request); const assignmentId = new URL(request.url).searchParams.get("assignmentId") ?? "";
    return Response.json({ profile: await readStudentCapabilityProfile(student, assignmentId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "能力图谱读取失败" }, { status: 500 });
  }
}
