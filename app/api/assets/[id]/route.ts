import { readAsset } from "../../../../lib/server/library";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const asset = await readAsset(id);
  if (!asset) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "Content-Type": asset.contentType });
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(asset.bytes, { headers });
}
