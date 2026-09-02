import { currentStudent } from "../../../../lib/server/homework-auth";

export async function GET(request: Request) {
  return Response.json({ student: await currentStudent(request) }, { headers: { "Cache-Control": "private, no-store" } });
}
