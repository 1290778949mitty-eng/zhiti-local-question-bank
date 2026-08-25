import type { Category, QuestionProvenance } from "./types";

export type ExamModule = {
  id: string;
  name: string;
  subtitle: string;
  rootCategoryId: string;
  paperTitle: string;
};

export const QUESTION_PROVENANCES: readonly QuestionProvenance[];
export const EXAM_MODULES: readonly ExamModule[];
export const EXAM_SEED_CATEGORIES: readonly Category[];
export function normalizeQuestionProvenance(value: unknown): QuestionProvenance;
