import katex from "katex";
import { splitMathText, toLatexMath } from "../../lib/math-text";
import { splitDisplayUnderlines } from "../../lib/question-presentation-rules.mjs";

export function MathText({ text, className = "" }: { text: string; className?: string }) {
  const renderMathText = (value: string, keyPrefix: string) => splitMathText(value).map((segment, index) => {
    const key = `${keyPrefix}-${index}`;
    if (segment.kind === "text") return <span key={key}>{segment.value}</span>;
    const display = segment.display === true;
    let html: string;
    try {
      html = katex.renderToString(toLatexMath(segment.value), {
        displayMode: display,
        throwOnError: true,
        strict: "ignore",
        trust: false,
        output: "htmlAndMathml",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "无法解析公式";
      // Keep source editable and visible, but never disguise a failed formula
      // as a successful rendering. React escapes both source and error text.
      return <span key={key} className="math-render-error" title={`公式待核对：${detail}`}>
        <span className="math-error-label">〔公式待核对〕</span>{segment.value}
      </span>;
    }
    return <span key={key} className={`math-formula ${display ? "display-math" : "inline-math"}`} data-math-display={display ? "block" : "inline"} dangerouslySetInnerHTML={{ __html: html }} />;
  });
  return <span className={`math-text ${className}`.trim()}>{splitDisplayUnderlines(text).map((segment, index) => segment.underlined
    ? <span className="word-underline" key={`underline-${index}`}>{renderMathText(segment.value, `underline-${index}`)}</span>
    : renderMathText(segment.value, `plain-${index}`))}</span>;
}
