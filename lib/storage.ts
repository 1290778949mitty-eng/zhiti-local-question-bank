import type { Category, LibraryData, LibraryModule, Question } from "./types";
import { EXAM_MODULES, EXAM_SEED_CATEGORIES } from "./exam-modules.mjs";

const DB_NAME = "zhiti-local-library";
const DB_VERSION = 2;
const MODULES = "modules";
const CATEGORIES = "categories";
const QUESTIONS = "questions";

const seedModules: LibraryModule[] = EXAM_MODULES.map((item, index) => ({
  id: item.rootCategoryId,
  name: item.name,
  subtitle: item.subtitle,
  sortOrder: index,
  createdAt: index + 1,
  updatedAt: index + 1,
}));
const seedCategories: Category[] = EXAM_SEED_CATEGORIES
  .filter((item) => item.parentId !== null)
  .map((item) => {
    let current: Category | undefined = item;
    let guard = 0;
    while (current?.parentId && guard < 100) {
      current = EXAM_SEED_CATEGORIES.find((candidate) => candidate.id === current?.parentId);
      guard += 1;
    }
    return { ...item, moduleId: current?.id, parentId: item.parentId };
  });
const seedQuestions: Question[] = [];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODULES)) db.createObjectStore(MODULES, { keyPath: "id" });
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
  let modules = await readAll<LibraryModule>(db, MODULES);
  let categories = await readAll<Category>(db, CATEGORIES);
  let questions = await readAll<Question>(db, QUESTIONS);
  if (!modules.length && !categories.length && !questions.length) {
    await replaceLibrary({ scope: "mine", modules: seedModules, categories: seedCategories, questions: seedQuestions });
    modules = seedModules;
    categories = seedCategories;
    questions = seedQuestions;
  } else if (!modules.length) {
    const roots = categories.filter((item) => item.parentId === null);
    modules = roots.map((item, index) => ({
      id: item.id, name: item.name, subtitle: "", sortOrder: index,
      createdAt: item.createdAt, updatedAt: item.createdAt,
    }));
    const byId = new Map(categories.map((item) => [item.id, item]));
    categories = categories.filter((item) => item.parentId !== null).map((item) => {
      let current: Category | undefined = item;
      let guard = 0;
      while (current?.parentId && guard < 100) { current = byId.get(current.parentId); guard += 1; }
      return { ...item, moduleId: current?.id };
    });
    questions = questions.map((item) => {
      let current = byId.get(item.categoryId);
      let guard = 0;
      while (current?.parentId && guard < 100) { current = byId.get(current.parentId); guard += 1; }
      return { ...item, moduleId: current?.id };
    });
    await replaceLibrary({ scope: "mine", modules, categories, questions });
  }
  db.close();
  return { scope: "mine", modules, categories, questions };
}

export async function replaceLibrary(data: LibraryData): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([MODULES, CATEGORIES, QUESTIONS], "readwrite");
  const moduleStore = tx.objectStore(MODULES);
  const categoryStore = tx.objectStore(CATEGORIES);
  const questionStore = tx.objectStore(QUESTIONS);
  moduleStore.clear(); categoryStore.clear(); questionStore.clear();
  data.modules.forEach((item) => moduleStore.put(item));
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
