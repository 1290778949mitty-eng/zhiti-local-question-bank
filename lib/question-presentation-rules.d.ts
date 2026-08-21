export const UNDERLINE_OPEN: string;
export const UNDERLINE_CLOSE: string;
export function markDocxUnderline(value: string): string;
export function splitDisplayUnderlines(value: string): Array<{ underlined: boolean; value: string }>;
export function automaticQuestionImageLayout(input: { imageCount: number; stemLength: number; paragraphCount: number }): "below" | "below-right" | null;
export function shouldUseBelowLayout(input: { imageCount: number; stemLength: number; paragraphCount: number }): boolean;
