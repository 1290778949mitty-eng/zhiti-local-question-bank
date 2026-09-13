export type MathTextSegment = { kind: "text" | "math"; value: string; explicit?: boolean; display?: boolean };
export type PlainTextWebLine = { value: string; align: "left" | "center" };
export { normalizeMathNotation } from "./math-notation.mjs";
export function splitMathText(text: string, options?: { autoDetect?: boolean }): MathTextSegment[];
export function splitMathLines(text: string): string[];
export function isStandaloneMathLine(text: string): boolean;
export function plainTextWebLines(text: string, options?: { stripLeadingQuestionNumber?: boolean }): PlainTextWebLine[];
export function latexFractionDepth(source: string): number;
/** @deprecated Diagnostic classification only; do not use it to resize math. */
export function fractionSizeClass(source: string): string;
export function toLatexMath(source: string): string;
/** @deprecated Alias of toLatexMath, with no automatic fraction enlargement. */
export function toReadableNestedFractionLatex(source: string): string;
