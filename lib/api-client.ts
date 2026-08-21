import type { AuthUser, Category, LibraryData, Question } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

export function fetchLibrary() { return request<LibraryData>("/api/library"); }
export function fetchMe() { return request<{ user: AuthUser | null }>("/api/auth/me"); }
export function register(email: string, password: string, inviteCode: string) { return request<{ user: AuthUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, inviteCode }) }); }
export function login(email: string, password: string) { return request<{ user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); }
export function logout() { return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }); }
export function createCloudQuestion(question: Question) { return request<{ question: Question }>("/api/questions", { method: "POST", body: JSON.stringify({ question }) }); }
export function updateCloudQuestion(question: Question) { return request<{ question: Question }>(`/api/questions/${encodeURIComponent(question.id)}`, { method: "PUT", body: JSON.stringify({ question }) }); }
export function deleteCloudQuestion(id: string) { return request<{ ok: boolean }>(`/api/questions/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export function createCloudCategory(category: Category) { return request<{ category: Category }>("/api/categories", { method: "POST", body: JSON.stringify({ category }) }); }
export function deleteCloudCategory(id: string) { return request<{ ok: boolean }>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export function importCloudLibrary(data: LibraryData) { return request<{ imported: number }>("/api/library/import", { method: "POST", body: JSON.stringify(data) }); }
export function authorizeDownload() { return request<{ ok: boolean }>("/api/download", { method: "POST" }); }
