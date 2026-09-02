export async function POST() {
  return Response.json({ error: "学生密码只能由老师设置或重置" }, { status: 403 });
}
