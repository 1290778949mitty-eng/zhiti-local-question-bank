import type { GradingVerdict, QuestionType } from "./types";
export function normalizeHomeworkAnswer(value: unknown): string;
export function isSimpleObjectiveAnswer(type: QuestionType, answer: string): boolean;
export function finalizeHomeworkVerdict(input: {
  type: QuestionType; standardAnswer: string; studentAnswer: string; modelVerdict: GradingVerdict;
  confidence: number; warnings: string[]; threshold: number;
}): { verdict: GradingVerdict; requiresReview: boolean; confidence: number };
