import type { LibraryModule, LibraryScope } from "../../../lib/types";
import { requireSameOrigin, requireUser } from "../../../lib/server/auth";
import { createScopedModule, reorderScopedModules } from "../../../lib/server/library";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as { module?: Partial<LibraryModule>; scope?: LibraryScope; order?: string[] };
    const scope: LibraryScope = body.scope === "public" ? "public" : "mine";
    if (Array.isArray(body.order)) {
      await reorderScopedModules(body.order, user, scope);
      return Response.json({ ok: true });
    }
    return Response.json({ module: await createScopedModule(body.module ?? {}, user, scope) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "模块创建失败" }, { status: 500 });
  }
}
