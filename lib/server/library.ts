import { env } from "cloudflare:workers";
import type { AuthUser, Category, LibraryData, Question } from "../../lib/types";

type AppEnv = { DB: D1Database };

function appEnv(): AppEnv {
  const bindings = env as unknown as AppEnv;
  if (!bindings.DB) throw new Error("D1 数据库尚未绑定");
  return bindings;
}

const seedCategories: Category[] = [
  { id: "math-7", name: "七年级数学", parentId: null, createdAt: 1 },
  { id: "rational", name: "有理数", parentId: "math-7", createdAt: 2 },
  { id: "number-line", name: "数轴", parentId: "rational", createdAt: 3 },
  { id: "opposite", name: "相反数", parentId: "rational", createdAt: 4 },
  { id: "absolute", name: "绝对值", parentId: "rational", createdAt: 5 },
  { id: "algebra", name: "整式的加减", parentId: "math-7", createdAt: 6 },
  { id: "equation", name: "一元一次方程", parentId: "math-7", createdAt: 7 },
];

const seedQuestions: Question[] = [
  { id: "q1", categoryId: "number-line", type: "单选题", difficulty: "基础", stem: "在数轴上，表示数 −3 的点到原点的距离是（　　）", options: ["−3", "3", "±3", "0"], answer: "B", analysis: "数轴上的点到原点的距离等于这个数的绝对值，所以 |−3|＝3。", source: "示例题", createdAt: 3, updatedAt: 3 },
  { id: "q2", categoryId: "opposite", type: "填空题", difficulty: "基础", stem: "−5 的相反数是______。", options: [], answer: "5", analysis: "只有符号不同的两个数互为相反数。", source: "示例题", createdAt: 2, updatedAt: 2 },
  { id: "q3", categoryId: "rational", type: "解答题", difficulty: "提高", stem: "计算：−2³ + 4 ×（−3）−（−5）。", options: [], answer: "−15", analysis: "原式＝−8−12＋5＝−15。注意乘方运算优先。", source: "示例题", createdAt: 1, updatedAt: 1 },
];

async function ensureSeedData() {
  const db = appEnv().DB;
  const row = await db.prepare("SELECT COUNT(*) AS count FROM categories").first<{ count: number }>();
  if (Number(row?.count ?? 0) > 0) return;
  const categoryStatements = seedCategories.map((category) => db.prepare("INSERT OR IGNORE INTO categories (id, name, parent_id, created_at, created_by) VALUES (?, ?, ?, ?, NULL)").bind(category.id, category.name, category.parentId, category.createdAt));
  const questionStatements = seedQuestions.map((question) => db.prepare("INSERT OR IGNORE INTO questions (id, category_id, payload_json, created_by, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)").bind(question.id, question.categoryId, JSON.stringify(question), question.createdAt, question.updatedAt));
  await db.batch([...categoryStatements, ...questionStatements]);
}

export async function readLibrary(user: AuthUser | null): Promise<LibraryData> {
  await ensureSeedData();
  const db = appEnv().DB;
  const [categoryResult, questionResult] = await db.batch([
    db.prepare("SELECT id, name, parent_id, created_at, created_by FROM categories ORDER BY created_at ASC"),
    db.prepare(`SELECT questions.payload_json, questions.created_by, users.email AS created_by_email
      FROM questions LEFT JOIN users ON users.id = questions.created_by ORDER BY questions.created_at DESC`),
  ]);
  const categories = (categoryResult.results as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), name: String(row.name), parentId: row.parent_id == null ? null : String(row.parent_id), createdAt: Number(row.created_at), createdBy: row.created_by == null ? null : String(row.created_by) }));
  const questions = (questionResult.results as Array<Record<string, unknown>>).map((row) => {
    const question = JSON.parse(String(row.payload_json)) as Question;
    const createdBy = row.created_by == null ? null : String(row.created_by);
    return { ...question, createdBy, createdByEmail: row.created_by_email == null ? null : String(row.created_by_email), canEdit: Boolean(user && (user.role === "admin" || createdBy === user.id)) };
  });
  return { categories, questions };
}

function dataUrlBytes(value: string) {
  const match = value.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  return { contentType: match[1], bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
}

async function uploadMediaValue(value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    const decoded = dataUrlBytes(value);
    if (!decoded) return value;
    const id = crypto.randomUUID();
    const db = appEnv().DB;
    const chunkSize = 500_000;
    await db.prepare("INSERT INTO question_assets (id, content_type, byte_size, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, decoded.contentType, decoded.bytes.byteLength, Date.now()).run();
    const statements = [];
    for (let offset = 0, index = 0; offset < decoded.bytes.byteLength; offset += chunkSize, index += 1) {
      const chunk = decoded.bytes.slice(offset, Math.min(offset + chunkSize, decoded.bytes.byteLength));
      statements.push(db.prepare("INSERT INTO question_asset_chunks (asset_id, chunk_index, data) VALUES (?, ?, ?)").bind(id, index, chunk.buffer));
    }
    if (statements.length) await db.batch(statements);
    return `/api/assets/${id}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map(uploadMediaValue));
  if (value && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await uploadMediaValue(item)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

export async function prepareQuestion(raw: Question, user: AuthUser, existing?: { createdBy: string | null; createdAt: number }) {
  const now = Date.now();
  const sanitized = { ...raw };
  delete sanitized.canEdit;
  delete sanitized.createdByEmail;
  const mediaSafe = await uploadMediaValue(sanitized) as Question;
  return {
    ...mediaSafe,
    id: raw.id || crypto.randomUUID(),
    stem: String(raw.stem ?? "").trim().slice(0, 100_000),
    categoryId: String(raw.categoryId ?? ""),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? user.id,
  };
}

export function canEdit(user: AuthUser, createdBy: string | null) {
  return user.role === "admin" || createdBy === user.id;
}

export function libraryBindings() {
  return appEnv();
}

export async function readAsset(id: string) {
  const db = appEnv().DB;
  const metadata = await db.prepare("SELECT content_type, byte_size FROM question_assets WHERE id = ?").bind(id).first<{ content_type: string; byte_size: number }>();
  if (!metadata) return null;
  const result = await db.prepare("SELECT data FROM question_asset_chunks WHERE asset_id = ? ORDER BY chunk_index ASC").bind(id).all<{ data: ArrayBuffer | number[] }>();
  const output = new Uint8Array(metadata.byte_size);
  let offset = 0;
  for (const row of result.results) {
    const chunk = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : Uint8Array.from(row.data);
    output.set(chunk, offset); offset += chunk.byteLength;
  }
  return { bytes: output, contentType: metadata.content_type };
}
