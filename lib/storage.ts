import type { Category, LibraryData, Question } from "./types";

const DB_NAME = "zhiti-local-library";
const DB_VERSION = 1;
const CATEGORIES = "categories";
const QUESTIONS = "questions";

const seedCategories: Category[] = [
  { id: "math-7", name: "七年级数学", parentId: null, createdAt: 1 },
  { id: "rational", name: "有理数", parentId: "math-7", createdAt: 2 },
  { id: "number-line", name: "数轴", parentId: "rational", createdAt: 3 },
  { id: "opposite", name: "相反数", parentId: "rational", createdAt: 4 },
  { id: "absolute", name: "绝对值", parentId: "rational", createdAt: 5 },
  { id: "algebra", name: "整式的加减", parentId: "math-7", createdAt: 6 },
  { id: "equation", name: "一元一次方程", parentId: "math-7", createdAt: 7 },
];

const now = Date.now();
const seedQuestions: Question[] = [
  { id: "q1", categoryId: "number-line", type: "单选题", difficulty: "基础", stem: "在数轴上，表示数 −3 的点到原点的距离是（　　）", options: ["−3", "3", "±3", "0"], answer: "B", analysis: "数轴上的点到原点的距离等于这个数的绝对值，所以 |−3|＝3。", source: "示例题", createdAt: now - 3000, updatedAt: now - 3000 },
  { id: "q2", categoryId: "opposite", type: "填空题", difficulty: "基础", stem: "−5 的相反数是______。", options: [], answer: "5", analysis: "只有符号不同的两个数互为相反数。", source: "示例题", createdAt: now - 2000, updatedAt: now - 2000 },
  { id: "q3", categoryId: "rational", type: "解答题", difficulty: "提高", stem: "计算：−2³ + 4 ×（−3）−（−5）。", options: [], answer: "−15", analysis: "原式＝−8−12＋5＝−15。注意乘方运算优先。", source: "示例题", createdAt: now - 1000, updatedAt: now - 1000 },
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CATEGORIES)) db.createObjectStore(CATEGORIES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(QUESTIONS)) db.createObjectStore(QUESTIONS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadLibrary(): Promise<LibraryData> {
  const db = await openDb();
  let categories = await readAll<Category>(db, CATEGORIES);
  let questions = await readAll<Question>(db, QUESTIONS);
  if (!categories.length && !questions.length) {
    await replaceLibrary({ categories: seedCategories, questions: seedQuestions });
    categories = seedCategories;
    questions = seedQuestions;
  }
  db.close();
  return { categories, questions };
}

export async function replaceLibrary(data: LibraryData): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([CATEGORIES, QUESTIONS], "readwrite");
  const categoryStore = tx.objectStore(CATEGORIES);
  const questionStore = tx.objectStore(QUESTIONS);
  categoryStore.clear(); questionStore.clear();
  data.categories.forEach((item) => categoryStore.put(item));
  data.questions.forEach((item) => questionStore.put(item));
  await complete(tx);
  db.close();
}

export async function saveCategory(category: Category): Promise<void> {
  const db = await openDb(); const tx = db.transaction(CATEGORIES, "readwrite");
  tx.objectStore(CATEGORIES).put(category); await complete(tx); db.close();
}

export async function saveQuestion(question: Question): Promise<void> {
  const db = await openDb(); const tx = db.transaction(QUESTIONS, "readwrite");
  tx.objectStore(QUESTIONS).put(question); await complete(tx); db.close();
}

export async function saveQuestions(questions: Question[]): Promise<void> {
  const db = await openDb(); const tx = db.transaction(QUESTIONS, "readwrite"); const store = tx.objectStore(QUESTIONS);
  questions.forEach((question) => store.put(question)); await complete(tx); db.close();
}

export async function removeQuestion(id: string): Promise<void> {
  const db = await openDb(); const tx = db.transaction(QUESTIONS, "readwrite");
  tx.objectStore(QUESTIONS).delete(id); await complete(tx); db.close();
}

export async function removeQuestions(ids: string[]): Promise<void> {
  const db = await openDb(); const tx = db.transaction(QUESTIONS, "readwrite"); const store = tx.objectStore(QUESTIONS);
  ids.forEach((id) => store.delete(id)); await complete(tx); db.close();
}

export async function removeCategories(categoryIds: string[], questionIds: string[]): Promise<void> {
  const db = await openDb(); const tx = db.transaction([CATEGORIES, QUESTIONS], "readwrite");
  categoryIds.forEach((id) => tx.objectStore(CATEGORIES).delete(id));
  questionIds.forEach((id) => tx.objectStore(QUESTIONS).delete(id));
  await complete(tx); db.close();
}
