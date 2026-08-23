import katex from "katex";
import { fractionSizeClass, splitMathText, toReadableNestedFractionLatex } from "../../lib/math-text";
import { splitDisplayUnderlines } from "../../lib/question-presentation-rules.mjs";

export function MathText({ text, className = "" }: { text: string; className?: string }) {
  const renderMathText = (value: string, keyPrefix: string) => splitMathText(value).map((segment, index) => {
    if (segment.kind === "text") return <span key={`${keyPrefix}-text-${index}`}>{segment.value}</span>;
    let html: string;
    try {
      html = katex.renderToString(toReadableNestedFractionLatex(segment.value), { throwOnError: true, strict: "ignore", output: "htmlAndMathml" });
    } catch { return <span key={`${keyPrefix}-math-${index}`}>{segment.value}</span>; }
    return <span className={`inline-math ${fractionSizeClass(segment.value)}`.trim()} key={`${keyPrefix}-math-${index}`} dangerouslySetInnerHTML={{ __html: html }} />;
  });
  return <span className={`math-text ${className}`.trim()}>{splitDisplayUnderlines(text).map((segment, index) => segment.underlined
    ? <span className="word-underline" key={`underline-${index}`}>{renderMathText(segment.value, `underline-${index}`)}</span>
    : renderMathText(segment.value, `plain-${index}`))}</span>;
}
