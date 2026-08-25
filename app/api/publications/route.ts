import { currentUser, requireSameOrigin } from "../../../lib/server/auth";
import { handleInternalPublication, publishLocalLibrary } from "../../../lib/server/publication";

function streamLocalPublication(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          const result = await publishLocalLibrary(user, (progress) => {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "progress", progress })}\n`));
          });
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "result", result })}\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "公共资源库发布失败" })}\n`));
        } finally {
          controller.close();
        }
      })();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
    if (request.headers.get("Authorization")) return Response.json(await handleInternalPublication(request, body));
    requireSameOrigin(request);
    const user = await currentUser(request);
    if (!user?.local) return Response.json({ error: "只能从 localhost 发布公共资源库" }, { status: 403 });
    if (body.action === "publish-local-stream") return streamLocalPublication(user);
    if (body.action !== "publish-local") return Response.json({ error: "未知发布操作" }, { status: 400 });
    return Response.json(await publishLocalLibrary(user));
  } catch (error) {
    const publicationId = typeof body.publicationId === "string" ? body.publicationId : "";
    if (publicationId) {
      try {
        const { libraryBindings } = await import("../../../lib/server/library");
        await libraryBindings().DB.prepare("UPDATE library_publications SET status = 'failed' WHERE id = ? AND status = 'staging'").bind(publicationId).run();
      } catch { /* 保留原错误 */ }
    }
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "公共资源库发布失败" }, { status: 500 });
  }
}
