export const UNDERLINE_OPEN = "\uE100";
export const UNDERLINE_CLOSE = "\uE101";

export function markDocxUnderline(value) {
  const content = value.trim()
    ? value
    : "\u00a0".repeat(Math.min(16, Math.max(4, value.length)));
  return `${UNDERLINE_OPEN}${content}${UNDERLINE_CLOSE}`;
}

export function splitDisplayUnderlines(value) {
  const segments = [];
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf(UNDERLINE_OPEN, cursor);
    if (start < 0) {
      if (cursor < value.length) segments.push({ underlined: false, value: value.slice(cursor) });
      break;
    }
    if (start > cursor) segments.push({ underlined: false, value: value.slice(cursor, start) });
    const end = value.indexOf(UNDERLINE_CLOSE, start + UNDERLINE_OPEN.length);
    if (end < 0) {
      segments.push({ underlined: false, value: value.slice(start) });
      break;
    }
    segments.push({ underlined: true, value: value.slice(start + UNDERLINE_OPEN.length, end) });
    cursor = end + UNDERLINE_CLOSE.length;
  }
  return segments.length ? segments : [{ underlined: false, value }];
}

export function automaticQuestionImageLayout({ imageCount, stemLength, paragraphCount }) {
  if (imageCount < 1) return null;
  if (imageCount > 1 || paragraphCount >= 8 || stemLength >= 700) return "below";
  if (paragraphCount >= 3 || stemLength >= 260) return "below-right";
  return null;
}

export function shouldUseBelowLayout(input) {
  return automaticQuestionImageLayout(input) != null;
}
