import type { StudioDraft } from "./answer-studio";

async function database() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open("mitty-answer-studio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function studioStorage(owner: string, action: "read" | "write" | "delete", value?: StudioDraft): Promise<StudioDraft | null> {
  if (!owner) throw new Error("需要登录后才能保存草稿");
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction("drafts", action === "read" ? "readonly" : "readwrite");
    const store = tx.objectStore("drafts");
    const request = action === "read" ? store.get(owner) : action === "write" ? store.put(value,owner) : store.delete(owner);
    tx.oncomplete = () => { db.close(); resolve(action === "read" ? request.result ?? null : null); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("本地保存失败，请备份草稿")); };
  });
}
