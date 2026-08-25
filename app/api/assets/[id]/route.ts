import { currentUser } from "../../../../lib/server/auth";
import { readAssetForUser } from "../../../../lib/server/library";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const asset = await readAssetForUser(id, await currentUser(request));
  if (!asset) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "Content-Type": asset.contentType });
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", asset.public ? "public, max-age=31536000, immutable" : "private, no-store");
  return new Response(asset.bytes, { headers });
}
