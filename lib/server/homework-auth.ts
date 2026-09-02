import { env } from "cloudflare:workers";
import type { AuthUser, StudentAccount, StudentAuth } from "../types";
import { hashPassword, verifyPassword } from "./auth";

type AppEnv = { DB: D1Database };
const STUDENT_COOKIE = "zhiti_student_session";
const SESSION_DAYS = 30;

function appEnv(): AppEnv {
  const bindings = env as unknown as AppEnv;
  if (!bindings.DB) throw new Error("D1 数据库尚未绑定");
  return bindings;
}

function responseError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "Content-Type": "application/json" } });
}

function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

function validLoginId(value: string) {
  return /^[\p{L}\p{N}._-]{2,40}$/u.test(value);
}

async function ownedStudent(studentId: string, user: AuthUser) {
  const row = await appEnv().DB.prepare("SELECT id FROM students WHERE id = ? AND owner_user_id = ?")
    .bind(studentId, user.id).first<{ id: string }>();
  if (!row) throw responseError("学生档案不存在", 404);
}

export async function ensureTeacherPortal(user: AuthUser) {
  const existing = await appEnv().DB.prepare("SELECT code, created_at FROM teacher_student_portals WHERE owner_user_id = ?")
    .bind(user.id).first<{ code: string; created_at: number }>();
  if (existing) return { code: existing.code, createdAt: Number(existing.created_at) };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomToken(6).replace(/[-_]/g, "").slice(0, 8).toLowerCase();
    try {
      const now = Date.now();
      await appEnv().DB.prepare("INSERT INTO teacher_student_portals (owner_user_id, code, created_at) VALUES (?, ?, ?)")
        .bind(user.id, code, now).run();
      return { code, createdAt: now };
    } catch { /* 极低概率代码碰撞，继续生成 */ }
  }
  throw new Error("无法生成学生入口代码");
}

function accountFromRow(row: Record<string, unknown>): StudentAccount {
  return {
    studentId: String(row.student_id), loginId: String(row.login_id),
    mustChangePassword: false,
    lastLoginAt: row.last_login_at == null ? null : Number(row.last_login_at),
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}

export async function readStudentAccount(studentId: string, user: AuthUser) {
  await ownedStudent(studentId, user);
  const row = await appEnv().DB.prepare(`SELECT student_id, login_id, must_change_password, last_login_at, created_at, updated_at
    FROM student_accounts WHERE student_id = ? AND owner_user_id = ?`).bind(studentId, user.id).first<Record<string, unknown>>();
  return row ? accountFromRow(row) : null;
}

export async function setStudentAccount(studentId: string, rawLoginId: string, password: string, user: AuthUser) {
  await ownedStudent(studentId, user);
  const loginId = normalizeLoginId(rawLoginId);
  if (!validLoginId(loginId)) throw responseError("学号需为 2 至 40 位中文、字母、数字、点、横线或下划线", 400);
  if (password.length < 8 || password.length > 128) throw responseError("初始密码需为 8 至 128 个字符", 400);
  const credential = await hashPassword(password);
  const existing = await readStudentAccount(studentId, user);
  const now = Date.now();
  try {
    if (existing) {
      await appEnv().DB.prepare(`UPDATE student_accounts SET login_id = ?, password_hash = ?, password_salt = ?, password_iterations = ?,
        must_change_password = 0, updated_at = ? WHERE student_id = ? AND owner_user_id = ?`)
        .bind(loginId, credential.hash, credential.salt, credential.iterations, now, studentId, user.id).run();
      await appEnv().DB.prepare("DELETE FROM student_sessions WHERE student_id = ?").bind(studentId).run();
      return { ...existing, loginId, mustChangePassword: false, updatedAt: now } satisfies StudentAccount;
    }
    await appEnv().DB.prepare(`INSERT INTO student_accounts
      (student_id, owner_user_id, login_id, password_hash, password_salt, password_iterations, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(studentId, user.id, loginId, credential.hash, credential.salt, credential.iterations, now, now).run();
    return { studentId, loginId, mustChangePassword: false, lastLoginAt: null, createdAt: now, updatedAt: now } satisfies StudentAccount;
  } catch (error) {
    if (error instanceof Response) throw error;
    if (String(error).includes("UNIQUE")) throw responseError("该学号已被当前老师的其他学生使用", 409);
    throw error;
  }
}

function studentFromRow(row: Record<string, unknown>): StudentAuth {
  return {
    studentId: String(row.student_id), ownerUserId: String(row.owner_user_id), name: String(row.name),
    loginId: String(row.login_id), teacherCode: String(row.teacher_code),
    mustChangePassword: false,
  };
}

export async function currentStudent(request: Request): Promise<StudentAuth | null> {
  const token = cookieValue(request, STUDENT_COOKIE);
  if (!token) return null;
  const row = await appEnv().DB.prepare(`SELECT student_accounts.student_id, student_accounts.owner_user_id,
      student_accounts.login_id, student_accounts.must_change_password, students.name, teacher_student_portals.code AS teacher_code
    FROM student_sessions
    JOIN student_accounts ON student_accounts.student_id = student_sessions.student_id
    JOIN students ON students.id = student_accounts.student_id
    JOIN teacher_student_portals ON teacher_student_portals.owner_user_id = student_accounts.owner_user_id
    WHERE student_sessions.token_hash = ? AND student_sessions.expires_at > ?`)
    .bind(await sha256(token), Date.now()).first<Record<string, unknown>>();
  return row ? studentFromRow(row) : null;
}

export async function requireStudent(request: Request) {
  const student = await currentStudent(request);
  if (!student) throw responseError("请先使用学生账号登录", 401);
  return student;
}

function studentSessionCookie(token: string, maxAge: number, secure: boolean) {
  return `${STUDENT_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function loginStudent(teacherCode: string, rawLoginId: string, password: string, address: string, secureCookie: boolean) {
  const loginId = normalizeLoginId(rawLoginId);
  const key = `student:${address}:${teacherCode.toLowerCase()}:${loginId}`;
  const since = Date.now() - 15 * 60 * 1000;
  const attempts = await appEnv().DB.prepare("SELECT COUNT(*) AS count FROM auth_attempts WHERE kind = 'student-login' AND attempt_key = ? AND created_at > ?")
    .bind(key, since).first<{ count: number }>();
  if (Number(attempts?.count ?? 0) >= 12) throw responseError("尝试次数过多，请 15 分钟后再试", 429);
  const row = await appEnv().DB.prepare(`SELECT student_accounts.student_id, student_accounts.owner_user_id, student_accounts.login_id,
      student_accounts.password_hash, student_accounts.password_salt, student_accounts.password_iterations,
      student_accounts.must_change_password, students.name, teacher_student_portals.code AS teacher_code
    FROM teacher_student_portals
    JOIN student_accounts ON student_accounts.owner_user_id = teacher_student_portals.owner_user_id
    JOIN students ON students.id = student_accounts.student_id
    WHERE teacher_student_portals.code = ? COLLATE NOCASE AND student_accounts.login_id = ? COLLATE NOCASE`)
    .bind(teacherCode.trim(), loginId).first<Record<string, unknown>>();
  const valid = row ? await verifyPassword(password, String(row.password_hash), String(row.password_salt), Number(row.password_iterations)) : false;
  if (!row || !valid) {
    const now = Date.now();
    await appEnv().DB.batch([
      appEnv().DB.prepare("INSERT INTO auth_attempts (kind, attempt_key, created_at) VALUES ('student-login', ?, ?)").bind(key, now),
      appEnv().DB.prepare("DELETE FROM auth_attempts WHERE created_at < ?").bind(now - 86_400_000),
    ]);
    throw responseError("老师代码、学号或密码不正确", 401);
  }
  const token = randomToken(); const now = Date.now();
  await appEnv().DB.batch([
    appEnv().DB.prepare("INSERT INTO student_sessions (token_hash, student_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), String(row.student_id), now + SESSION_DAYS * 86_400_000, now),
    appEnv().DB.prepare("UPDATE student_accounts SET must_change_password = 0, last_login_at = ?, updated_at = ? WHERE student_id = ?")
      .bind(now, now, String(row.student_id)),
  ]);
  return {
    student: studentFromRow(row),
    cookie: studentSessionCookie(token, SESSION_DAYS * 86400, secureCookie),
  };
}

export async function logoutStudent(request: Request) {
  const token = cookieValue(request, STUDENT_COOKIE);
  if (token) await appEnv().DB.prepare("DELETE FROM student_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return studentSessionCookie("", 0, new URL(request.url).protocol === "https:");
}

export function homeworkAuthDb() { return appEnv().DB; }
