export type MathTextSegment = { kind: "text" | "math"; value: string; explicit?: boolean };
import { normalizeMathNotation } from "./math-notation.mjs";
export { normalizeMathNotation } from "./math-notation.mjs";

const mathChunkPattern = /[A-Za-z0-9√∠△∑∫π∞∴∵±∓−＋－+\-×÷＝=<>≤≥≠≈≌^_²³⁴⁵⁶⁷⁸⁹⁰¹⁻⁺/()[\]（）°\s\\{}]+/g;
const formulaSignal = /[\\√∠△∑∫π∞∴∵±∓−＋－+\-×÷＝=<>≤≥≠≈≌^_²³⁴⁵⁶⁷⁸⁹⁰¹⁻⁺/]/;
const standaloneMathIdentifier = /^(?:[A-Z]{1,4}|[a-z])$/;
const superDigits: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-" };

function appendAutomaticChunk(segments: MathTextSegment[], raw: string) {
  for (const piece of raw.split(/(_{2,})/).filter(Boolean)) {
    if (/^_{2,}$/.test(piece)) {
      segments.push({ kind: "text", value: piece });
      continue;
    }
    const leading = piece.match(/^\s*/)?.[0] ?? "";
    const trailing = piece.match(/\s*$/)?.[0] ?? "";
    const core = piece.trim();
    if (core && (formulaSignal.test(core) || standaloneMathIdentifier.test(core))) {
      if (leading) segments.push({ kind: "text", value: leading });
      segments.push({ kind: "math", value: core });
      if (trailing) segments.push({ kind: "text", value: trailing });
    } else segments.push({ kind: "text", value: piece });
  }
}

function splitAutomatic(text: string): MathTextSegment[] {
  const segments: MathTextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(mathChunkPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: "text", value: text.slice(cursor, start) });
    const raw = match[0];
    appendAutomaticChunk(segments, raw);
    cursor = start + raw.length;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}

export function splitMathText(text: string): MathTextSegment[] {
  const segments: MathTextSegment[] = [];
  const explicitMath = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)/g;
  let cursor = 0;
  for (const match of text.matchAll(explicitMath)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push(...splitAutomatic(text.slice(cursor, start)));
    segments.push({ kind: "math", value: match[1] ?? match[2] ?? match[3] ?? "", explicit: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push(...splitAutomatic(text.slice(cursor)));
  return segments.filter((segment) => segment.value.length > 0);
}

export function toLatexMath(source: string) {
  let latex = normalizeMathNotation(source).trim().replace(/\*\*/g, "^");
  latex = latex.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)/g, (value) => `^{${[...value].map((char) => superDigits[char] ?? char).join("")}}`);
  latex = latex.replace(/√\s*（([^（）]+)）/g, "\\sqrt{$1}").replace(/√\s*\(([^()]+)\)/g, "\\sqrt{$1}").replace(/√\s*([A-Za-z0-9.]+)/g, "\\sqrt{$1}");
  const replacements: Array<[RegExp, string]> = [
    [/（/g, "("], [/）/g, ")"], [/＝/g, "="], [/＋/g, "+"], [/[−－]/g, "-"], [/×/g, "\\times "], [/÷/g, "\\div "],
    [/≤/g, "\\le "], [/≥/g, "\\ge "], [/≠/g, "\\ne "], [/≈/g, "\\approx "], [/±/g, "\\pm "], [/∓/g, "\\mp "],
    [/∠/g, "\\angle "], [/△/g, "\\triangle "], [/π/g, "\\pi "], [/∞/g, "\\infty "], [/∴/g, "\\therefore "], [/∵/g, "\\because "], [/°/g, "^{\\circ}"],
  ];
  replacements.forEach(([pattern, value]) => { latex = latex.replace(pattern, value); });
  return latex;
}
