import type { GradingItem, SubmissionReport } from "./types";
export function normalizeSubmissionReport(value: unknown, now?: number): SubmissionReport;
export function buildFallbackSubmissionReport(items: Array<Partial<GradingItem> & { questionNumber?: string }>, now?: number): SubmissionReport;
