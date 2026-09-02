export type MathTextSegment = { kind: "text" | "math"; value: string; explicit?: boolean };
export type PlainTextWebLine = { value: string; align: "left" | "center" };
import { normalizeMathNotation } from "./math-notation.mjs";
export { normalizeMathNotation } from "./math-notation.mjs";

const mathChunkPattern = /[A-Za-z0-9√∠△∑∫π∞∴∵±∓−＋－+\-×÷＝=<>＜＞≤≥≠≈≌^_²³⁴⁵⁶⁷⁸⁹⁰¹⁻⁺/()[\]（）°\s\\{}]+/g;
const formulaSignal = /[\\√∠△∑∫π∞∴∵±∓−＋－+\-×÷＝=<>＜＞≤≥≠≈≌^_²³⁴⁵⁶⁷⁸⁹⁰¹⁻⁺/]/;
const standaloneMathIdentifier = /^(?:[A-Z]{1,4}|[a-z])$/;
const superDigits: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-" };

function appendAutomaticCore(segments: MathTextSegment[], value: string) {
  if (!value) return;
  segments.push({ kind: formulaSignal.test(value) || standaloneMathIdentifier.test(value) ? "math" : "text", value });
}

function unmatchedParentheses(value: string) {
  const open: number[] = []; const unmatched: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(" || value[index] === "（") open.push(index);
    else if (value[index] === ")" || value[index] === "）") {
      if (open.length) open.pop(); else unmatched.push(index);
    }
  }
  return [...unmatched, ...open].sort((a, b) => a - b);
}

function appendAutomaticPiece(segments: MathTextSegment[], piece: string) {
  const leading = piece.match(/^\s*/)?.[0] ?? "";
  const trailing = piece.match(/\s*$/)?.[0] ?? "";
  const core = piece.trim();
  if (!core) {
    segments.push({ kind: "text", value: piece });
    return;
  }
  if (leading) segments.push({ kind: "text", value: leading });
  const delimiters = unmatchedParentheses(core);
  if (!delimiters.length) appendAutomaticCore(segments, core);
  else {
    let cursor = 0;
    for (const index of delimiters) {
      appendAutomaticCore(segments, core.slice(cursor, index));
      segments.push({ kind: "text", value: core[index] });
      cursor = index + 1;
    }
    appendAutomaticCore(segments, core.slice(cursor));
  }
  if (trailing) segments.push({ kind: "text", value: trailing });
}

function appendAutomaticChunk(segments: MathTextSegment[], raw: string) {
  for (const piece of raw.split(/(_{2,})/).filter(Boolean)) {
    if (/^_{2,}$/.test(piece)) segments.push({ kind: "text", value: piece });
    else appendAutomaticPiece(segments, piece);
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

export function isStandaloneMathLine(text: string) {
  const segments = splitMathText(text).filter((segment) => segment.value.trim().length > 0);
  const onlyMathAndPunctuation = segments.some((segment) => segment.kind === "math")
    && segments.every((segment) => segment.kind === "math" || /^[\s,，.。;；:：!?！？]+$/.test(segment.value));
  if (!onlyMathAndPunctuation) return false;
  const knownFunctions = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "log", "exp", "lim", "max", "min", "gcd", "lcm"]);
  const automaticText = segments.filter((segment) => segment.kind === "math" && !segment.explicit).map((segment) => segment.value).join(" ");
  const proseWords = automaticText.match(/[A-Za-z]+/g) ?? [];
  return proseWords.every((word) => knownFunctions.has(word.toLowerCase()) || !/^[A-Z][a-z]+$/.test(word) && word.length <= 3);
}

export function plainTextWebLines(text: string, options: { stripLeadingQuestionNumber?: boolean } = {}): PlainTextWebLine[] {
  return text.split(/\r?\n/).map((rawLine, index) => {
    const value = options.stripLeadingQuestionNumber && index === 0
      ? rawLine.replace(/^\s*\d{1,3}[.．、]\s*/, "")
      : rawLine;
    return { value, align: isStandaloneMathLine(value) ? "center" : "left" };
  });
}

export function latexFractionDepth(source: string) {
  const latex = normalizeMathNotation(source).replace(/\*\*/g, "^");

  function skipWhitespace(index: number) {
    while (/\s/.test(latex[index] ?? "")) index += 1;
    return index;
  }

  function commandAt(index: number) {
    const name = latex.slice(index + 1).match(/^[A-Za-z]+/)?.[0] ?? latex[index + 1] ?? "";
    return { name, next: index + 1 + name.length };
  }

  function argumentAt(index: number): { depth: number; next: number } {
    const start = skipWhitespace(index);
    if (latex[start] === "{") {
      const group = rangeAt(start + 1, "}");
      return { depth: group.depth, next: group.next };
    }
    if (latex[start] === "\\") {
      const command = commandAt(start);
      if (["frac", "dfrac", "tfrac"].includes(command.name)) return fractionAt(command.next);
      return { depth: 0, next: command.next };
    }
    return { depth: 0, next: Math.min(latex.length, start + 1) };
  }

  function fractionAt(index: number): { depth: number; next: number } {
    const numerator = argumentAt(index);
    const denominator = argumentAt(numerator.next);
    return { depth: 1 + Math.max(numerator.depth, denominator.depth), next: denominator.next };
  }

  function rangeAt(index: number, end?: string): { depth: number; next: number } {
    let depth = 0;
    while (index < latex.length) {
      if (end && latex[index] === end) return { depth, next: index + 1 };
      if (latex[index] === "{") {
        const group = rangeAt(index + 1, "}");
        depth = Math.max(depth, group.depth); index = group.next; continue;
      }
      if (latex[index] === "\\") {
        const command = commandAt(index);
        if (["frac", "dfrac", "tfrac"].includes(command.name)) {
          const fraction = fractionAt(command.next);
          depth = Math.max(depth, fraction.depth); index = fraction.next; continue;
        }
        index = command.next; continue;
      }
      index += 1;
    }
    return { depth, next: index };
  }

  return rangeAt(0).depth;
}

export function fractionSizeClass(source: string) {
  const depth = latexFractionDepth(source);
  return depth >= 3 ? "math-fraction-deep" : depth >= 2 ? "math-fraction-nested" : "";
}

export function toLatexMath(source: string) {
  let latex = normalizeMathNotation(source).trim().replace(/\*\*/g, "^");
  latex = latex.replace(/(?<!\\)%/g, "\\%");
  latex = latex.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)/g, (value) => `^{${[...value].map((char) => superDigits[char] ?? char).join("")}}`);
  latex = latex.replace(/√\s*（([^（）]+)）/g, "\\sqrt{$1}").replace(/√\s*\(([^()]+)\)/g, "\\sqrt{$1}").replace(/√\s*([A-Za-z0-9.]+)/g, "\\sqrt{$1}");
  const replacements: Array<[RegExp, string]> = [
    [/（/g, "("], [/）/g, ")"], [/＝/g, "="], [/＋/g, "+"], [/[−－]/g, "-"], [/＜/g, "<"], [/＞/g, ">"], [/×/g, "\\times "], [/÷/g, "\\div "],
    [/≤/g, "\\le "], [/≥/g, "\\ge "], [/≠/g, "\\ne "], [/≈/g, "\\approx "], [/±/g, "\\pm "], [/∓/g, "\\mp "],
    [/∠/g, "\\angle "], [/△/g, "\\triangle "], [/π/g, "\\pi "], [/∞/g, "\\infty "], [/∴/g, "\\therefore "], [/∵/g, "\\because "], [/°/g, "^{\\circ}"],
  ];
  replacements.forEach(([pattern, value]) => { latex = latex.replace(pattern, value); });
  return latex;
}

export function toReadableNestedFractionLatex(source: string) {
  const latex = toLatexMath(source);
  if (latexFractionDepth(latex) < 2) return latex;
  return latex.replace(/\\(?:frac|tfrac)\b/g, "\\dfrac");
}
