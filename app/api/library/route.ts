import { currentUser } from "../../../lib/server/auth";
import { readLibrary } from "../../../lib/server/library";
import type { LibraryScope } from "../../../lib/types";

export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("scope");
    const scope: LibraryScope = requested === "mine" ? "mine" : "public";
    return Response.json(await readLibrary(await currentUser(request), scope), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "题库读取失败" }, { status: 500 });
  }
}
