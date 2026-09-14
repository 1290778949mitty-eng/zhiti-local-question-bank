import { requireSameOrigin, requireUser } from "../../../../../lib/server/auth";
import { discoverAiProviderModels } from "../../../../../lib/server/ai-provider";

async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== "admin") throw new Response(JSON.stringify({ error: "仅管理员可以获取 AI 模型目录" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin(request);
    const body = await request.json() as { baseUrl?: string; apiKey?: string };
    return Response.json(await discoverAiProviderModels({ baseUrl: body.baseUrl, apiKey: body.apiKey }));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "获取上游模型失败" }, { status: 502 });
  }
}
