import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { copyPublicQuestions } from "../../../../lib/server/library";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as { questionIds?: string[]; targetModuleId?: string; targetCategoryId?: string };
    if (!Array.isArray(body.questionIds) || !body.targetModuleId) return Response.json({ error: "请选择题目和目标模块" }, { status: 400 });
    const questions = await copyPublicQuestions(body.questionIds, body.targetModuleId, body.targetCategoryId || body.targetModuleId, user);
    return Response.json({ questions, copied: questions.length });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "复制题目失败" }, { status: 500 });
  }
}
