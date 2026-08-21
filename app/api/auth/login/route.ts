import { authBindings, authRateLimited, clientAddress, createSession, normalizeEmail, recordAuthAttempt, requireSameOrigin, verifyPassword } from "../../../../lib/server/auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json() as { email?: string; password?: string };
    const email = normalizeEmail(body.email ?? "");
    const key = `${clientAddress(request)}:${email}`;
    if (await authRateLimited("login", key)) return Response.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });
    const user = await authBindings().DB.prepare("SELECT id, email, role, password_hash, password_salt, password_iterations FROM users WHERE email = ?")
      .bind(email).first<{ id: string; email: string; role: "admin" | "member"; password_hash: string; password_salt: string; password_iterations: number }>();
    const valid = user ? await verifyPassword(body.password ?? "", user.password_hash, user.password_salt, user.password_iterations) : false;
    if (!user || !valid) {
      await recordAuthAttempt("login", key);
      return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
    }
    const cookie = await createSession(user.id);
    return Response.json({ user: { id: user.id, email: user.email, role: user.role } }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "登录失败" }, { status: 500 });
  }
}
