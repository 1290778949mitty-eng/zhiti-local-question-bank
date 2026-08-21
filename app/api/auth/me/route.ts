import { currentUser } from "../../../../lib/server/auth";

export async function GET(request: Request) {
  return Response.json({ user: await currentUser(request) });
}
