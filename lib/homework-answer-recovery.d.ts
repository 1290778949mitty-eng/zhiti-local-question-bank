import type { ExtractedAssignmentQuestion } from "./homework-grading-contract";

export const assignmentAnswerRecoverySchema: Record<string, unknown>;
export function normalizeQuestionNumber(value: unknown): string;
export function normalizeAssignmentAnswerRecovery(value: unknown): Array<{
  question_number: string;
  answer: string;
  analysis: string;
  confidence: number;
  warnings: string[];
}>;
export function buildAssignmentAnswerRecoveryPrompt(
  questions: Array<{ question_number: string; stem: string }>,
  pageStart: number,
  pageEnd: number,
): string;
export function mergeAssignmentAnswerRecovery(
  questions: ExtractedAssignmentQuestion[],
  recovered: ReturnType<typeof normalizeAssignmentAnswerRecovery>,
): ExtractedAssignmentQuestion[];
export function incompleteAssignmentAnswers(questions: ExtractedAssignmentQuestion[]): ExtractedAssignmentQuestion[];
